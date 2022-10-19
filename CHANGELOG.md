# Changelog

## 2.0.2

Feature - update sqlds to 2.3.13 which fixes some macro queries

## 2.0.1

Bug - now works with Safari. Safari does not support regex look aheads

## 2.0.0

Feature - upgrade driver to support HTTP
Feature - Changed how ad hoc filters work with a settings option provided in CH 22.7
Feature - Conditional alls are now handled with a conditional all function. The function checks if the second parameter is a template var set to all, if it then replaces the function with 1=1, and if not set the function to the first parameter.
Bug - visual query builder can use any date type for time field
Fix - 'any' is now an aggregation type in the visual query builder
Fix - time filter macros can be used in the adhoc query
Bug - time interval macro cannot have an interval of 0
Fix - update drive to v2.1.0
Bug - expand query button works with grafana 8.0+
Fix - added adhoc columns macro

## 1.1.2

Bug - add timerange to metricFindQuery

## 1.1.1

Bug - add timeout

## 1.1.0

Feature - add convention for showing logs panel in Explore

## 1.0.0

Official release

## 0.12.7

Fix - ignore template vars when validating sql

## 0.12.6

Fix - Time series builder - use time alias when grouping/ordering

## 0.12.5

Chore - dashboards

## 0.12.4

Fix - timeseries where clause. make default db the default in visual editor

## 0.12.3

Fix - when removing conditional all, check scoped vars (support repeating panels)

## 0.12.2

Fix - when removing conditional all, only remove lines with variables

## 0.12.1

Fix - handle large decimals properly

## 0.12.0

Feature - Time series builder: use $__timeInterval macro on time field so buckets can be adjusted from query options.

## 0.11.0

Feature - Time series: Hide fields, use group by in select, use time field in group by

## 0.10.0

Feature - Ad-Hoc sourced by database or table

## 0.9.13

Fix - update sdk to show streaming errors

## 0.9.12

Fix - format check after ast change

## 0.9.11

Feature - $__timeInterval(column) and $__interval_s macros

## 0.9.10

Fix - Set format when using the new Run Query button.

## 0.9.9

Feature - Query Builder.

## 0.9.8

Fix - Detect Multi-line time series. Handle cases with functions.

## 0.9.7

Feature - Multi-line time series.

## 0.9.6

Bug - Change time template variable names.

## 0.9.5

Bug - Fix global template variables.

## 0.9.4

Bug - Fix query type variables.

## 0.9.3

Bug - Support Array data types.

## 0.9.2

Bug - Fix TLS model.

## 0.9.1

Add secure toggle to config editor.

## 0.9.0

Initial Beta release.
