package plugin

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestInstanceSettingsHandler(t *testing.T) {
	get := func() string {
		rw := httptest.NewRecorder()
		instanceSettingsHandler(rw, httptest.NewRequest(http.MethodGet, instanceSettingsRoute, nil))
		assert.Equal(t, http.StatusOK, rw.Code)
		return rw.Body.String()
	}

	assert.JSONEq(t, `{"allowClearTextJWTForwarding":false}`, get())

	t.Setenv(clearTextJWTForwardingEnv, "true")
	assert.JSONEq(t, `{"allowClearTextJWTForwarding":true}`, get())
}
