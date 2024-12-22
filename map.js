document.addEventListener('DOMContentLoaded', () => {
    const infoBox = document.getElementById('info-box');
    const defaultMessage = document.getElementById('default-message');
    const stateNameElement = document.getElementById('state-name');
    const stateChairElement = document.getElementById('state-chair');
    const exitButton = document.getElementById('exit-button');

    let map;
    let geojsonLayer;
    let selectedStateLayer;
    let markersLayer;
    let markerClusterGroup;
    let allStatesGeoJSON;
    let chaptersDataGlobal = [];
    const stateCounts = {};
    const chairData = {};
    const zipCodeLookup = {};
    const stateAbbreviationMap = {
        AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
        CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
        HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
        KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
        MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
        MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
        NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
        ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
        RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
        TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
        WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
    };

    function getColor(count) {
        return count > 10 ? '#08306b' :
            count > 8 ? '#08519c' :
                count > 6 ? '#2171b5' :
                    count > 4 ? '#4292c6' :
                        count > 2 ? '#6baed6' :
                            count > 1 ? '#9ecae1' : '#c6dbef';
    }

    function formatZipCode(zipCode) {
        let formattedZip = String(zipCode);
        if (formattedZip.startsWith('0')) {
            formattedZip = formattedZip.substring(1);
        }
        if (formattedZip.includes('-')) {
            formattedZip = formattedZip.split('-')[0];
        }
        return formattedZip;
    }

    function getCoordinatesFromZip(zipCode) {
        const formattedZip = formatZipCode(zipCode);
        const zipEntry = zipCodeLookup[formattedZip];
        if (zipEntry) {
            return [zipEntry.lat, zipEntry.lon];
        }
        return null;
    }

    function initializeMap() {
        if (map) {
            map.off();
            map.remove();
        }
        map = L.map('map', { zoomControl: false }).setView([39.8283, -98.5795], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: 'Map data &copy; OpenStreetMap contributors',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
    }

    function showExitButton() {
        exitButton.classList.add('visible');
        exitButton.style.display = 'block';
    }

    function hideExitButton() {
        exitButton.classList.remove('visible');
        exitButton.style.display = 'none';
    }

    const customIcon = L.divIcon({
        className: 'custom-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
    });

    function addClusteredMarkers() {
        markerClusterGroup = L.markerClusterGroup({
            iconCreateFunction: function (cluster) {
                const childCount = cluster.getChildCount();
                let clusterClass = 'marker-cluster-small';

                if (childCount > 50) {
                    clusterClass = 'marker-cluster-large';
                } else if (childCount > 10) {
                    clusterClass = 'marker-cluster-medium';
                }

                return new L.DivIcon({
                    html: `<div><span>${childCount}</span></div>`,
                    className: `marker-cluster ${clusterClass}`,
                    iconSize: [40, 40]
                });
            }
        });

        chaptersDataGlobal.forEach(row => {
            const zipCode = row['Zip code'];
            const coordinates = getCoordinatesFromZip(zipCode);

            if (!coordinates) {
                return;
            }

            const marker = L.marker(coordinates, { icon: customIcon });
            marker.bindPopup(`
                <b style="color: #0F1B79;">${row['ChapterName']}</b><br>
                City: ${row['City']}<br>
                Leader: ${row['ChapterLeaderName']}
            `);
            markerClusterGroup.addLayer(marker);
        });

        map.addLayer(markerClusterGroup);
    }

    function addStatesToMap() {
        geojsonLayer = L.geoJSON(allStatesGeoJSON, {
            style: feature => {
                const stateName = feature.properties.name.trim();
                const count = stateCounts[stateName] || 0;

                if (count === 0) {
                    return { weight: 0, fillOpacity: 0 };
                }

                return {
                    color: '#fff',
                    weight: 1,
                    fillColor: getColor(count),
                    fillOpacity: 0.7
                };
            },
            onEachFeature: (feature, layer) => {
                const stateName = feature.properties.name.trim();
                const chapterCount = stateCounts[stateName] || 0;

                if (chapterCount === 0) {
                    return;
                }

                layer.on({
                    mouseover: e => {
                        const layer = e.target;
                        layer.setStyle({
                            weight: 4,
                            color: '#0F1B79',
                            fillOpacity: 0.8
                        });
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            layer.bringToFront();
                        }
                    },
                    mouseout: e => geojsonLayer.resetStyle(e.target),
                    click: () => {
                        if (selectedStateLayer) map.removeLayer(selectedStateLayer);

                        selectedStateLayer = L.geoJSON(feature, {
                            style: {
                                fillColor: getColor(chapterCount),
                                fillOpacity: 0.7,
                                weight: 5,
                                color: '#0F1B79'
                            }
                        }).addTo(map);

                        geojsonLayer.eachLayer(otherLayer => {
                            if (otherLayer.feature.properties.name.trim() !== stateName) {
                                map.removeLayer(otherLayer);
                            }
                        });

                        const stateMarkers = [];
                        chaptersDataGlobal.forEach(row => {
                            const zipCode = row['Zip code'];
                            const formattedZip = formatZipCode(zipCode);
                            const zipEntry = zipCodeLookup[formattedZip];

                            if (zipEntry && stateAbbreviationMap[zipEntry.state] === stateName) {
                                const coordinates = [zipEntry.lat, zipEntry.lon];
                                const marker = L.marker(coordinates, { icon: customIcon });
                                marker.bindPopup(`
                                    <b style="color: #0F1B79;">${row['ChapterName']}</b><br>
                                    City: ${row['City']}<br>
                                    Leader: ${row['ChapterLeaderName']}
                                `);
                                stateMarkers.push(marker);
                            }
                        });

                        markerClusterGroup.clearLayers();
                        markerClusterGroup.addLayers(stateMarkers);
                        map.addLayer(markerClusterGroup);

                        stateNameElement.textContent = stateName;
                        stateChairElement.innerHTML = `
                            Chair: ${chairData[stateName]?.chair || 'N/A'}<br>
                            Regional Director: ${chairData[stateName]?.regionalDirector || 'N/A'}
                        `;
                        infoBox.classList.remove('hidden');
                        defaultMessage.classList.add('hidden');

                        map.fitBounds(layer.getBounds());
                        showExitButton();
                    }
                });
            }
        }).addTo(map);
    }

    function resetMap() {
        if (selectedStateLayer) map.removeLayer(selectedStateLayer);

        infoBox.classList.add('hidden');
        defaultMessage.classList.remove('hidden');
        hideExitButton();

        map.setView([39.8283, -98.5795], 5);

        geojsonLayer.eachLayer(layer => {
            const stateName = layer.feature.properties.name.trim();
            const count = stateCounts[stateName] || 0;

            if (count > 0) {
                map.addLayer(layer);
                layer.setStyle({
                    color: '#fff',
                    weight: 1,
                    fillColor: getColor(count),
                    fillOpacity: 0.7
                });
            }
        });

        markerClusterGroup.clearLayers();
        addClusteredMarkers();
    }

    exitButton.addEventListener('click', resetMap);

    fetch('chairs.csv')
        .then(response => response.text())
        .then(csvText => {
            const rows = csvText.trim().split('\n');
            rows.forEach((row, index) => {
                if (index === 0) return;
                const [state, chair, regionalDirector] = row.split(',');
                if (state && chair && regionalDirector) {
                    const stateName = state.trim();
                    chairData[stateName] = {
                        chair: chair.trim(),
                        regionalDirector: regionalDirector.trim()
                    };
                }
            });
        })
        .catch(error => console.error('Error loading chairs.csv:', error));

    fetch('zipcodes.json')
        .then(response => response.json())
        .then(zipData => {
            zipData.forEach(entry => {
                const zipStr = formatZipCode(entry.zip_code);
                zipCodeLookup[zipStr] = {
                    lat: entry.latitude,
                    lon: entry.longitude,
                    state: entry.state
                };
            });
            return fetch('data.json');
        })
        .then(response => response.json())
        .then(chapterData => {
            chaptersDataGlobal = chapterData;

            chaptersDataGlobal.forEach(row => {
                const zipCode = row['Zip code'];
                const formattedZip = formatZipCode(zipCode);
                const zipEntry = zipCodeLookup[formattedZip];

                if (zipEntry && zipEntry.state) {
                    const stateAbbreviation = zipEntry.state;
                    const stateName = stateAbbreviationMap[stateAbbreviation];
                    if (stateName) {
                        stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
                    }
                }
            });

            return fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
        })
        .then(response => response.json())
        .then(geojsonData => {
            allStatesGeoJSON = geojsonData;

            initializeMap();
            addClusteredMarkers();
            addStatesToMap();
        })
        .catch(error => console.error('Error loading data:', error));
});

window.initializeMap = initializeMap;
