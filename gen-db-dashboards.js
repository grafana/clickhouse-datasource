/**
 * This script will code-gen a Grafana dashboard using the "system.dashboards" table in a locally running ClickHouse instance.
 */

const fs = require('fs/promises');
const pluginVersion = require('./package.json').version;

const OUTPUT_FILE = './src/dashboards/system-dashboards.json';
const CLICKHOUSE_ADDRESS = 'localhost:8123';

async function fetchDashboardsFromClickHouse() {
	const query = 'SELECT * FROM system.dashboards FORMAT JSON'
	const url = `http://${CLICKHOUSE_ADDRESS}/?query=${query}`;

	let response;
	try {
		response = await fetch(url, {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});
	} catch (err) {
		throw new Error('failed to fetch dashboards from ClickHouse HTTP: ' + err);
	}

	const queryResponse = await response.json();
	return queryResponse.data;
}

function generatePanels(clickHouseDashboards) {
	const panelWidth = 12;
	const panelHeight = 8;

	let lastRowName = '';
	const panels = [];
	for (let i = 0; i < clickHouseDashboards.length; i++) {
		const id = i + 1;
		const dashboard = clickHouseDashboards[i];
		const { dashboard: dashboardTitle, title: name, query } = dashboard;
		const positionX = i % 2 === 0 ? 0 : panelWidth;
		const positionY = panelHeight * Math.floor(i / 2);
		const panel = generatePanel(id, name, query, panelWidth, panelHeight, positionX, positionY);

		if (lastRowName !== dashboardTitle) {
			const rowPanel = generateRowPanel(dashboardTitle, positionY);
			panels.push(rowPanel);
			lastRowName = dashboardTitle;
		}

		panels.push(panel);
	}

	return panels;
}

function generateDashboard(panels) {
	return {
		__inputs: [
			{
				name: "the_datasource",
				label: "The Datasource",
				description: "",
				type: "datasource",
				pluginId: "grafana-clickhouse-datasource",
				pluginName: "ClickHouse"
			}
		],
		__elements: {},
		__requires: [
			{
				type: "grafana",
				id: "grafana",
				name: "Grafana",
				version: "11.2.0-pre"
			},
			{
				type: "datasource",
				id: "grafana-clickhouse-datasource",
				name: "ClickHouse",
				version: pluginVersion,
			},
			{
				type: "panel",
				id: "timeseries",
				name: "Time series",
				version: ""
			}
		],
		annotations: {
			list: [
				{
					builtIn: 1,
					datasource: {
						type: "grafana",
						uid: "-- Grafana --"
					},
					enable: true,
					hide: true,
					iconColor: "rgba(0, 211, 255, 1)",
					name: "Annotations & Alerts",
					type: "dashboard"
				}
			]
		},
		description: "Similar to the monitoring dashboard that is built in to ClickHouse.",
		editable: true,
		fiscalYearStartMonth: 0,
		graphTooltip: 0,
		id: null,
		links: [],
		panels,
		schemaVersion: 39,
		tags: [],
		templating: {
			list: []
		},
		time: {
			from: "now-6h",
			to: "now"
		},
		timepicker: {},
		timezone: "browser",
		title: "Advanced ClickHouse Monitoring Dashboard",
		uid: null,
		version: 1,
		weekStart: ""
	};
}

// Transform query to fit Grafana variables
function preprocessQuery(rawQuery) {
	rawQuery = rawQuery.replaceAll('event_date >= toDate(now() - {seconds:UInt32}) AND event_time >= now() - {seconds:UInt32}', '$__dateFilter(event_date) AND $__timeFilter(event_time)');
	rawQuery = rawQuery.replaceAll('event_date >= toDate(now() - {seconds:UInt32})\n    AND event_time >= now() - {seconds:UInt32}', '$__dateFilter(event_date) AND $__timeFilter(event_time)');
	rawQuery = rawQuery.replaceAll('{rounding:UInt32}', '$__interval_s');
	rawQuery = rawQuery.replaceAll('::INT AS t', ' AS t');
	return rawQuery;
}

function generatePanel(id, name, rawQuery, width, height, x, y) {
	const rawSql = preprocessQuery(rawQuery);

	return {
		datasource: {
			type: "grafana-clickhouse-datasource",
			uid: "${the_datasource}"
		},
		fieldConfig: {
			defaults: {
				color: {
					mode: "palette-classic"
				},
				custom: {
					axisBorderShow: false,
					axisCenteredZero: false,
					axisColorMode: "text",
					axisLabel: "",
					axisPlacement: "auto",
					barAlignment: 0,
					drawStyle: "line",
					fillOpacity: 0,
					gradientMode: "none",
					hideFrom: {
						legend: false,
						tooltip: false,
						viz: false
					},
					insertNulls: false,
					lineInterpolation: "linear",
					lineWidth: 1,
					pointSize: 5,
					scaleDistribution: {
						type: "linear"
					},
					showPoints: "auto",
					spanNulls: false,
					stacking: {
						group: "A",
						mode: "none"
					},
					thresholdsStyle: {
						mode: "off"
					}
				},
				mappings: [],
				thresholds: {
					mode: "absolute",
					steps: [
						{
							color: "green",
							value: null
						},
						{
							color: "red",
							value: 80
						}
					]
				}
			},
			overrides: []
		},
		gridPos: {
			h: height,
			w: width,
			x: x,
			y: y
		},
		id,
		options: {
			legend: {
				calcs: [],
				displayMode: "list",
				placement: "bottom",
				showLegend: true
			},
			tooltip: {
				mode: "single",
				sort: "none"
			}
		},
		targets: [
			{
				datasource: {
					type: "grafana-clickhouse-datasource",
					uid: "${the_datasource}"
				},
				editorType: "sql",
				format: 0,
				meta: {
					builderOptions: {
						columns: [],
						database: "",
						limit: 1000,
						mode: "list",
						queryType: "table",
						table: ""
					}
				},
				pluginVersion,
				queryType: "timeseries",
				rawSql,
				refId: "A"
			}
		],
		title: name,
		type: "timeseries"
	};
}

function generateRowPanel(rowName, positionY) {
	return {
		collapsed: false,
		gridPos: {
			h: 1,
			w: 24,
			x: 0,
			y: positionY
		},
		id: null,
		panels: [],
		title: rowName,
		type: "row"
	};
}

async function main() {
	const clickHouseDashboards = await fetchDashboardsFromClickHouse();
	const panels = generatePanels(clickHouseDashboards);
	const dashboard = generateDashboard(panels);
	let fileData = JSON.stringify(dashboard, null, '\t');
	fileData += '\n';

	try {
		await fs.writeFile(OUTPUT_FILE, fileData, 'utf-8');
	} catch (err) {
		throw new Error('failed to write dashboard to file: ' + err);
	}

	console.log(`Saved dashboard to ${OUTPUT_FILE}`);
}
main().catch(console.error);
