package deploy

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func publishWorkflow(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile("../.github/workflows/publish.yml")
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// The image path must follow the repository, so a repo move needs no edit here.
func TestPublishWorkflowDerivesTheImageFromTheRepository(t *testing.T) {
	wf := publishWorkflow(t)

	if strings.Contains(wf, "iliyan-s-petkov") {
		t.Error("publish.yml hard-codes the repository owner; derive it from github.repository")
	}
	// ghcr.io appears once: in the step that builds IMAGE from the lowercased repository.
	if n := strings.Count(wf, "ghcr.io/"); n != 2 {
		t.Errorf("publish.yml mentions ghcr.io/ %d times, want 2 (one IMAGE definition per job)", n)
	}
	define := regexp.MustCompile(`echo "IMAGE=ghcr\.io/\$\{GITHUB_REPOSITORY,,\}" >> "\$GITHUB_ENV"`)
	if n := len(define.FindAllString(wf, -1)); n != 2 {
		t.Errorf("found %d IMAGE definitions from GITHUB_REPOSITORY, want 2 (pr-check and publish)", n)
	}
	if strings.Contains(wf, "org.opencontainers.image.source=https://github.com/") {
		t.Error("the OCI source label hard-codes github.com and the repository")
	}
	if !strings.Contains(wf, "org.opencontainers.image.source=${{ github.server_url }}/${{ github.repository }}") {
		t.Error("the OCI source label is not built from github.server_url and github.repository")
	}
}

// Every image reference after the definition goes through env.IMAGE.
func TestPublishWorkflowUsesTheDerivedImageEverywhere(t *testing.T) {
	wf := publishWorkflow(t)
	for _, want := range []string{
		"tags: ${{ env.IMAGE }}:pr-check",
		"image-ref: ${{ env.IMAGE }}:pr-check",
		"tags: ${{ env.IMAGE }}:${{ steps.tag.outputs.short }}",
		"image-ref: ${{ env.IMAGE }}@${{ steps.build.outputs.digest }}",
		"cosign sign --yes ${{ env.IMAGE }}@${{ steps.build.outputs.digest }}",
		`"$IMAGE:latest"`,
		`"$IMAGE:$REF_NAME"`,
		`"$IMAGE@$DIGEST"`,
	} {
		if !strings.Contains(wf, want) {
			t.Errorf("publish.yml lacks %q", want)
		}
	}
}
