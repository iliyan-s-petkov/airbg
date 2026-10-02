package config

import (
	"strings"
	"testing"
)

// The shipped file leaves both social networks unset: the footer shows GitHub only.
func TestSocialIsEmptyInTheCommittedConfig(t *testing.T) {
	cfg := good(t)
	if cfg.Social.FacebookURL != "" || cfg.Social.LinkedInURL != "" {
		t.Errorf("committed social = %+v, want both empty", cfg.Social)
	}
}

func TestSocialURLsComeFromTheEnvironment(t *testing.T) {
	t.Setenv("AIRBG_SOCIAL_FACEBOOK_URL", "https://www.facebook.com/airbg")
	t.Setenv("AIRBG_SOCIAL_LINKEDIN_URL", "https://www.linkedin.com/company/airbg")
	cfg := good(t)
	if cfg.Social.FacebookURL != "https://www.facebook.com/airbg" || cfg.Social.LinkedInURL != "https://www.linkedin.com/company/airbg" {
		t.Errorf("social = %+v, want the environment values", cfg.Social)
	}
}

func TestSocialURLsMustBeHTTPS(t *testing.T) {
	for _, bad := range []string{"javascript:alert(1)", "http://www.facebook.com/airbg", "facebook.com/airbg", "https://"} {
		cfg := good(t)
		cfg.Social.FacebookURL = bad
		err := cfg.Validate()
		if err == nil || !strings.Contains(err.Error(), "social.facebook_url") {
			t.Errorf("Validate(%q) = %v, want a social.facebook_url problem", bad, err)
		}
	}
}
