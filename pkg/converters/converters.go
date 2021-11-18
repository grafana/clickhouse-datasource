package converters

import (
	"fmt"
	"reflect"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

var SECONDTIME = sqlutil.Converter{
	Name:          "SECONDTIME to string",
	InputScanType: reflect.TypeOf(time.Time{}),
	InputTypeName: "SECONDTIME",
	FrameConverter: sqlutil.FrameConverter{
		FieldType: data.FieldTypeString,
		ConverterFunc: func(in interface{}) (interface{}, error) {
			f := in.(*time.Time)
			return fmt.Sprintf("%02d:%02d:%02d", f.Hour(), f.Minute(), f.Second()), nil
		},
	},
}
