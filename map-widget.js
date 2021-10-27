class MapWidget {

    #mapOptionsDefault = {
        zoomControl: false,
        initialViewType: 'FITS_CONTENT', // accepted values: 'CENTER_POINT', 'FITS_CONTENT',
        initialViewPoint: {
            lat: 38,
            lon: 24,
            zoom: 9,
        },
        delimitedValues: true,
        valueDelimiter: '|', // ignored if delimitedValues: false
        detectUrl: true,
        excludeProperties: null,
        includeOnlyProperties: null,
    };

    #mapContainerId;

    #geoserverBaseUrl;

    #wmsLayers;
    
    #mapOptions;

    #map;

    #overlays = {};

    #popup;

    #popupFeatures = [];

    #currentPopupPage;

    constructor(mapContainerId, geoserverBaseUrl, wmsLayers, mapOptions) {
        if (!mapContainerId || !geoserverBaseUrl || !wmsLayers || !wmsLayers.length) throw new Error('Insufficient arguments');

        this.#mapContainerId = mapContainerId;
        this.#geoserverBaseUrl = geoserverBaseUrl;
        this.#wmsLayers = wmsLayers;
        this.#mapOptions = { ...this.#mapOptionsDefault, ...mapOptions };
    }

    #addWmsLayers() {
        this.#wmsLayers.forEach(x => {
            this.#overlays[x.label] = L.tileLayer.wms(this.#geoserverBaseUrl, {
                layers: x.layers,
                format: x.format || 'image/png',
                transparent: true,
            });
            if (x.openByDefault) this.#overlays[x.label].addTo(this.#map);
        })

        L.control.layers(null, this.#overlays).addTo(this.#map);
    }

    #getNamesOfLayers() {
        return this.#wmsLayers.map(x => x.layers.split(',')).flat();
    }

    #getNamesOfActiveLayers() {
        const labelsOfActiveWms = Object.keys(this.#overlays).filter(x => this.#map.hasLayer(this.#overlays[x]));

        return this.#wmsLayers
            .filter(x => labelsOfActiveWms.includes(x.label))
            .map(x => x.layers.split(',')).flat();;
    }

    async #getCapabilities() {
        const url = `${this.#geoserverBaseUrl}?request=GetCapabilities`;

        const response = await fetch(url);
        let data = await response.text();
        data = new WMSCapabilities(data).toJSON();
        return data;
    }

    #getFeatureInfo = async (bboxString, width, height, queryLayersString, x, y) => {
        const requestParams = {
            REQUEST: 'GetFeatureInfo',
            VERSION: '1.1.0',
            SRS: 'EPSG:4326',
            BBOX: bboxString,
            WIDTH: width,
            HEIGHT: height,
            QUERY_LAYERS: queryLayersString,
            LAYERS: queryLayersString,
            FEATURE_COUNT: 1000,
            X: x,
            Y: y,
            INFO_FORMAT: 'application/json',
        };

        const queryString = Object.keys(requestParams).map((x, i) => `${x}=${Object.values(requestParams)[i]}`).join('&');
        const requestUrl = `${this.#geoserverBaseUrl}?${queryString}`;
        
        let response = await fetch(requestUrl);
        const data = await response.json();
        return data;
    }

    async #zoomToWmsContent() {
        const initialBBoxCoords = [200, 200, -200, -200];

        const capabilities = await this.#getCapabilities();
        const geoserverLayers = capabilities.Capability.Layer.Layer;

        const bboxArrs = geoserverLayers
            .filter(x => this.#getNamesOfActiveLayers().length ? this.#getNamesOfActiveLayers().includes(x.Name) : this.#getNamesOfLayers().includes(x.Name))
            .map(x => x.BoundingBox.some(y => y.crs === 'EPSG:4326') ? x.BoundingBox.find(y => y.crs === 'EPSG:4326').extent : [200, 200, -200, -200]);

        const bbox = bboxArrs.reduce((s, c) => {
            return [
                c[0] < s[0] ? c[0] : s[0],
                c[1] < s[1] ? c[1] : s[1],
                c[2] > s[2] ? c[2] : s[2],
                c[3] > s[3] ? c[3] : s[3],
            ];
        }, initialBBoxCoords);

        this.#map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]]);
    }

    async #showInfoPopup(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
      
        const bboxString = this.#map.getBounds().toBBoxString();
        const width = this.#map._size.x;
        const height = this.#map._size.y;
        const queryLayersString = this.#getNamesOfActiveLayers().join(',');
        const x = e.originalEvent.x;
        const y = e.originalEvent.y;

        const data = await this.#getFeatureInfo(bboxString, width, height, queryLayersString, x, y);
        this.#popupFeatures = data.features;

        console.log(this.#popupFeatures);
        
        if (!this.#popupFeatures.length) return;

        this.#popup = L.popup({ minWidth: 200, maxWidth: 0.7 * this.#map._size.x, maxHeight: 0.7 * this.#map._size.y })
            .setLatLng([lat, lon])
            .openOn(this.#map);

        this.#currentPopupPage = 0;
        this.#setPopupContent(this.#currentPopupPage);
    }

    #goToPage(direction) {
        const pages = {
            prev: this.#currentPopupPage - 1,
            next: this.#currentPopupPage + 1,
        };

        const targetPage = pages[direction];

        this.#setPopupContent(targetPage);
        this.#currentPopupPage = targetPage;
    }

    #getValueFormat(value) {
        let vals = this.#mapOptions.delimitedValues && typeof value === 'string'
            ? value.split(this.#mapOptions.valueDelimiter)
            : [value];

        vals = this.#mapOptions.detectUrl
            ? vals.map(x => typeof x === 'string' && (x.startsWith('http') || x.startsWith('www')) ? `<a href=${x} target="_blank">${x}</a>` : x)
            : vals;

        return vals.length > 1
            ? vals.map(x => `<span>${x}</span>`).join('')
            : `${[vals] || '-'}`;
    }

    #getPopupTemplate(feature, currentFeatureIndex, totalFeaturesNum) {
        return `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <h3>${currentFeatureIndex + 1} of ${totalFeaturesNum}</h3>
                <div>
                    ${currentFeatureIndex !== 0 ? '<svg class="popup__prev_page" style="height: 2em; cursor: pointer;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>' : ''}
                    ${currentFeatureIndex + 1 !== totalFeaturesNum ? '<svg class="popup__next_page" style="height: 2em; cursor: pointer;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>' : ''}
                </div>
            </div>
            <hr>
            <h3>Layer: 
                ${this.#mapOptions.layerAliases && this.#mapOptions.layerAliases.some(x => x.name === feature.id.split('.')[0])
                    ? this.#mapOptions.layerAliases.find(x => x.name === feature.id.split('.')[0]).alias
                    : feature.id.split('.')[0]}
            </h3>
            <hr>
            <div style="display: grid; grid-template-columns: min-content 1fr; column-gap: 15px; overflow-wrap: anywhere;">
                ${
                    Object.keys(feature.properties)
                        .filter(x => this.#mapOptions.excludeProperties ? !this.#mapOptions.excludeProperties.includes(x) : x)
                        .filter(x => this.#mapOptions.includeOnlyProperties ? this.#mapOptions.includeOnlyProperties.map(y => y.property).includes(x) : x)
                        .map((x, i) => `
                            <div style="overflow-wrap: initial;">
                                ${this.#mapOptions.includeOnlyProperties ? this.#mapOptions.includeOnlyProperties.find(y => y.property === x).label : x}
                            </div>
                            <div style="display: flex; flex-direction: column; justify-content: end;">
                                ${this.#getValueFormat(Object.values(feature.properties)[i])}
                            </div>
                        `).join('')
                }
            </div>
        `;
    }

    #setPopupContent(page) {
        let popupContent = this.#getPopupTemplate(this.#popupFeatures[page], page, this.#popupFeatures.length);

        this.#popup.setContent(popupContent);

        if (document.querySelector(`#${this.#mapContainerId} .popup__prev_page`)) document.querySelector('#map_widget .popup__prev_page').onclick = () => {
            this.#goToPage('prev');
        }
        if (document.querySelector(`#${this.#mapContainerId} .popup__next_page`)) document.querySelector('#map_widget .popup__next_page').onclick = () => {
            this.#goToPage('next');
        }
    }

    init() {
        this.#map = L.map(this.#mapContainerId, { zoomControl: this.#mapOptions.zoomControl });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.#map);

        this.#addWmsLayers();

        switch (this.#mapOptions.initialViewType) {
            case 'CENTER_POINT':
                this.#map.setView([this.#mapOptions.initialViewPoint.lat, this.#mapOptions.initialViewPoint.lon], this.#mapOptions.initialViewPoint.zoom);
                break;
            case 'FITS_CONTENT':
                this.#zoomToWmsContent();
                break;
            default:
                throw new Error('Invalid value for initialViewType');
        }

        this.#map.on('click', (e) => {
            this.#showInfoPopup(e);
        })
    }

}