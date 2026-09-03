// t-notes: single-user local app + self-installer for Windows.
// Built on Omarchy with: GOOS=windows GOARCH=amd64 go build -o dist/t-notes.exe .
// The same binary acts as setup when its filename contains "setup".
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed web
var assets embed.FS

func main() {
	exe, _ := os.Executable()
	if strings.Contains(strings.ToLower(filepath.Base(exe)), "setup") || hasFlag("--install") {
		if err := install(exe); err != nil {
			fmt.Fprintln(os.Stderr, "install failed:", err)
			os.Exit(1)
		}
		return
	}
	if hasFlag("--uninstall") {
		uninstall()
		return
	}
	serve(false)
}

func hasFlag(f string) bool {
	for _, a := range os.Args[1:] {
		if a == f {
			return true
		}
	}
	return false
}

// serve starts the local server and opens the default browser.
func serve(quiet bool) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/startup", startupHandler)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		b, err := assets.ReadFile("web/" + p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		switch filepath.Ext(p) {
		case ".html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".js":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		case ".svg":
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		w.Write(b)
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(os.Stderr, "listen:", err)
		os.Exit(1)
	}
	url := "http://" + ln.Addr().String()
	// ponytail: rundll32 over exec of a specific browser — uses the installed default, zero bundled runtime
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	fmt.Println("t-notes running at", url)
	http.Serve(ln, mux)
}

// install copies the app to %LocalAppData% and creates Desktop + Start Menu shortcuts.
func install(src string) error {
	dest := filepath.Join(os.Getenv("LocalAppData"), "t-notes")
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	app := filepath.Join(dest, "t-notes.exe")
	if !sameFile(src, app) {
		b, err := os.ReadFile(src)
		if err != nil {
			return err
		}
		if err := os.WriteFile(app, b, 0755); err != nil {
			return err
		}
	}
	desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop", "t-notes.lnk")
	start := filepath.Join(os.Getenv("AppData"), "Microsoft", "Windows", "Start Menu", "Programs", "t-notes.lnk")
	for _, lnk := range []string{desktop, start} {
		if err := createShortcut(lnk, app, dest); err != nil {
			return err
		}
	}
	fmt.Println("Installed to", dest, "+ Desktop & Start Menu shortcuts")
	serve(false)
	return nil
}

func uninstall() {
	dest := filepath.Join(os.Getenv("LocalAppData"), "t-notes")
	for _, lnk := range []string{
		filepath.Join(os.Getenv("USERPROFILE"), "Desktop", "t-notes.lnk"),
		filepath.Join(os.Getenv("AppData"), "Microsoft", "Windows", "Start Menu", "Programs", "t-notes.lnk"),
	} {
		os.Remove(lnk)
	}
	fmt.Println("Shortcuts removed. Delete", dest, "to finish.")
}

func createShortcut(lnk, target, workdir string) error {
	ps := fmt.Sprintf(`$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%s'); $sc.TargetPath = '%s'; $sc.WorkingDirectory = '%s'; $sc.Description = 't-notes — notes + kanban'; $sc.Save()`, lnk, target, workdir)
	return exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", ps).Run()
}

func startupLnk() string {
	return filepath.Join(os.Getenv("AppData"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "t-notes.lnk")
}

func startupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		var req struct{ Enabled bool }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if req.Enabled {
			exe, _ := os.Executable()
			if err := createShortcut(startupLnk(), exe, filepath.Dir(exe)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			os.Remove(startupLnk())
		}
	}
	_, err := os.Stat(startupLnk())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"enabled": err == nil})
}

func sameFile(a, b string) bool {
	ai, err1 := os.Stat(a)
	bi, err2 := os.Stat(b)
	return err1 == nil && err2 == nil && os.SameFile(ai, bi)
}
