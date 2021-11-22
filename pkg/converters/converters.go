package converters

import (
	"fmt"
	"reflect"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

var FLOAT32 = sqlutil.Converter{
	Name:          "float32 to float64",
	InputScanType: reflect.TypeOf(float32(0)),
	InputTypeName: "Nullable(Float32)",
	FrameConverter: sqlutil.FrameConverter{
		FieldType: data.FieldTypeFloat64.NullableType(),
		ConverterFunc: func(in interface{}) (interface{}, error) {
			if in == nil {
				return nil, nil
			}
			f := in.(*float32)
			float := float64(*f)
			return &float, nil
		},
	},
}

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
