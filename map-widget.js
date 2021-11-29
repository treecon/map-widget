class MapWidget {

    #mapOptionsDefault = {
        zoomControl: true,
        zoomControlPosition: 'TOP_LEFT', // ignored if zoomControl: false, accepted values: 'TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'
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
        header: null,
    };

    #headerOptionsDefault = {
        logoImageUrl: '',
        title: '',
        backgroundColor: 'rgb(248, 249, 250)', // RGB format required
        textColor: '#121212',
        height: 54,
        logoOverflow: false,
        logoImageHeight: 80, // ignored if logoOverflow: false
    }

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
        this.#validateArgs(mapContainerId, geoserverBaseUrl, wmsLayers, mapOptions);

        this.#mapContainerId = mapContainerId;
        this.#geoserverBaseUrl = geoserverBaseUrl;
        this.#wmsLayers = wmsLayers;
        this.#mapOptions = { ...this.#mapOptionsDefault, ...mapOptions };
        if (mapOptions && mapOptions.header) this.#mapOptions.header = { ...this.#headerOptionsDefault, ...mapOptions.header };
    }

    #validateArgs(mapContainerId, geoserverBaseUrl, wmsLayers, mapOptions) {
        if (!mapContainerId || !geoserverBaseUrl || !wmsLayers || !wmsLayers.length) throw new Error('Insufficient arguments');

        if (!mapOptions) return;
        if (mapOptions.header && (!mapOptions.header.logoImageUrl || !mapOptions.header.title)) throw new Error('Insufficient arguments for header');
        if (mapOptions.header && mapOptions.header.backgroundColor && !mapOptions.header.backgroundColor.toLowerCase().includes('rgb(')) throw new Error('Header background color must be in RGB format');
        if (mapOptions.zoomControl && mapOptions.zoomControlPosition && !['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'].includes(mapOptions.zoomControlPosition)) throw new Error('Wrong zoom control position');
        if (mapOptions.initialViewType && !['CENTER_POINT', 'FITS_CONTENT'].includes(mapOptions.initialViewType)) throw new Error('Wrong initial view type');
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
            BUFFER: 0,
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
            .map(x => x.BoundingBox.some(y => ['EPSG:4326', 'CRS:84'].includes(y.crs)) ? x.BoundingBox.find(y => ['EPSG:4326', 'CRS:84'].includes(y.crs)).extent : [200, 200, -200, -200]);

        const bbox = bboxArrs.reduce((s, c) => {
            return [
                c[0] < s[0] ? c[0] : s[0],
                c[1] < s[1] ? c[1] : s[1],
                c[2] > s[2] ? c[2] : s[2],
                c[3] > s[3] ? c[3] : s[3],
            ];
        }, initialBBoxCoords);

        document.querySelectorAll(`#${this.#mapContainerId} .loader-container`).forEach((e) => {
            e.remove();
        })

        this.#map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    }

    #changeDisplayOfControls (type) {
        if (!['show', 'hide'].includes(type)) return;
        document.querySelector(`#${this.#mapContainerId} .leaflet-control-container`).style.display = type === 'show' ? 'block' : 'none';
    }

    async #showInfoPopup(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
      
        const bboxString = this.#map.getBounds().toBBoxString();
        const width = this.#map._size.x;
        const height = this.#map._size.y;
        const queryLayersString = this.#getNamesOfActiveLayers().join(',');
        const x = Math.round(e.originalEvent.x - e.originalEvent.target.getBoundingClientRect().left);
        const y = Math.round(e.originalEvent.y - e.originalEvent.target.getBoundingClientRect().top);

        const data = await this.#getFeatureInfo(bboxString, width, height, queryLayersString, x, y);
        this.#popupFeatures = data.features;

        if (!this.#popupFeatures.length) return;

        this.#changeDisplayOfControls('hide');

        this.#popup = L.popup({ minWidth: 200, maxWidth: 0.7 * this.#map._size.x, maxHeight: 0.7 * this.#map._size.y })
            .setLatLng([lat, lon])
            .openOn(this.#map);

        this.#popup.on('remove', () => {
            this.#changeDisplayOfControls('show');
        })

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
            <div style="display: grid; grid-template-columns: min-content 1fr; column-gap: 15px; row-gap: 5px; padding-top: 5px; overflow-wrap: anywhere;">
                ${
                    Object.keys(feature.properties)
                        .filter(x => this.#mapOptions.excludeProperties ? !this.#mapOptions.excludeProperties.includes(x) : x)
                        .filter(x => this.#mapOptions.includeOnlyProperties ? this.#mapOptions.includeOnlyProperties.map(y => y.property).includes(x) : x)
                        .map((x, i) => `
                            <div style="overflow-wrap: initial; font-weight: bold;">
                                ${this.#mapOptions.includeOnlyProperties
                                    ? this.#mapOptions.includeOnlyProperties.find(y => y.property === x).label
                                    : this.#mapOptions.propertyAliases && this.#mapOptions.propertyAliases.some(y => y.name === x)
                                        ? this.#mapOptions.propertyAliases.find(y => y.name === x).alias
                                        : x
                                }
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

        if (document.querySelector(`#${this.#mapContainerId} .popup__prev_page`)) document.querySelector(`#${this.#mapContainerId} .popup__prev_page`).onclick = () => {
            this.#goToPage('prev');
        }
        if (document.querySelector(`#${this.#mapContainerId} .popup__next_page`)) document.querySelector(`#${this.#mapContainerId} .popup__next_page`).onclick = () => {
            this.#goToPage('next');
        }
    }

    #rgbToRgba(rgb, alpha) {
        return rgb.replace('rgb', 'rgba').replace(')', `,${alpha})`);
    }

    #manipulateDOM() {
        const elementContainer = document.getElementById(this.#mapContainerId);
        elementContainer.style.display = 'flex';
        elementContainer.style.flexDirection = 'column';

        const idSuffix = Date.now();

        const elementHeader = this.#mapOptions.header ? document.createElement('div') : null;
        if (elementHeader) {
            elementHeader.setAttribute('class', `${this.#mapContainerId}__header_${idSuffix}`);
            elementHeader.style.cssText = `
                height: ${this.#mapOptions.header.height}px;
                background: ${this.#mapOptions.header.backgroundColor};
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
            `;

            document.getElementById(this.#mapContainerId).appendChild(elementHeader);

            elementHeader.innerHTML = `
                <div style="
                    height: ${this.#mapOptions.header.logoOverflow ? `${this.#mapOptions.header.logoImageHeight}px` : 'calc(100% - 16px)'};
                    background: ${this.#rgbToRgba(this.#mapOptions.header.backgroundColor, 0.5)};
                    z-index: 2000;
                    padding: ${this.#mapOptions.header.logoOverflow ? '8px' : '0'};
                    border-radius: 5px;
                    margin: 0 20px 0 10px;
                    margin-left: 10px;
                    flex-shrink: 0;"
                >
                    <img style="height: 100%; width: 100%;" src="${this.#mapOptions.header.logoImageUrl}">
                </div>
                <h3 style='
                    font-family: "Helvetica Neue", Arial, Helvetica, sans-serif;
                    color: ${this.#mapOptions.header.textColor};
                    text-align: right;
                    margin-right: 10px; 
                    display: flex; 
                    align-items: center'
                >${this.#mapOptions.header.title}</h3>
            `;
        }

        const elementMap = document.createElement('div');
        const elementMapId = `${this.#mapContainerId}__map_${idSuffix}`;
        elementMap.setAttribute('id', elementMapId);
        elementMap.style.cssText = `
            width: 100%;
            flex-grow: 1;
        `;
        document.getElementById(this.#mapContainerId).appendChild(elementMap);

        if (this.#mapOptions.initialViewType === 'FITS_CONTENT') {
            elementMap.innerHTML = `
                <div class="loader-container" style="display: flex; align-items: center; justify-content: center; height: 100%; width: 100%;">
                    <svg style="height: 30%; width: 30%; max-height: 100px; max-width: 100px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" xml:space="preserve"><circle fill="none" stroke="#121212" stroke-width="4" cx="50" cy="50" r="44" style="opacity:.5"/><circle fill="#ddd" stroke="#121212" stroke-width="3" cx="8" cy="54" r="6"><animateTransform attributeName="transform" dur="2s" type="rotate" from="0 50 48" to="360 50 52" repeatCount="indefinite"/></circle></svg>
                </div>
            `;
        }

        return {
            getElementMapId: () => {
                return elementMapId;
            }
        }
    }

    #fixLeafletWhiteLinesBetweenTilesBug() {
        const originalInitTile = L.GridLayer.prototype._initTile
        L.GridLayer.include({
            _initTile: function (tile) {
                originalInitTile.call(this, tile);
    
                var tileSize = this.getTileSize();
    
                tile.style.width = tileSize.x + 1 + 'px';
                tile.style.height = tileSize.y + 1 + 'px';
            }
        });
    }

    #createMap(elementMapId) {
        this.#fixLeafletWhiteLinesBetweenTilesBug();

        this.#map = L.map(elementMapId, { zoomControl: false });

        if (this.#mapOptions.zoomControl) {
            const positions = { TOP_LEFT: 'topleft', TOP_RIGHT: 'topright', BOTTOM_LEFT: 'bottomleft', BOTTOM_RIGHT: 'bottomright' };
            L.control.zoom({
                position: positions[this.#mapOptions.zoomControlPosition],
            }).addTo(this.#map);
        }

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.#map);

        this.#map.attributionControl.setPrefix('');

        this.#addWmsLayers();

        switch (this.#mapOptions.initialViewType) {
            case 'CENTER_POINT':
                this.#map.setView([this.#mapOptions.initialViewPoint.lat, this.#mapOptions.initialViewPoint.lon], this.#mapOptions.initialViewPoint.zoom);
                break;
            case 'FITS_CONTENT':
                this.#zoomToWmsContent();
                break;
            default:
        }

        this.#map.on('click', (e) => {
            this.#showInfoPopup(e);
        });
    }

    init() {
        const elementMapId = this.#manipulateDOM().getElementMapId();
        this.#createMap(elementMapId);
    }

}