//go:build mage

package main

// Magefile for building the Kentik datasource backend plugin.
//
// Common targets:
//   mage -v build:linux    # build the Linux amd64 binary into dist/
//   mage -v buildAll       # build binaries for all supported platforms
//   mage -v test           # run Go tests
//
// See https://github.com/grafana/grafana-plugin-sdk-go for the shared build
// targets provided by the SDK.

import (
	// mage:import
	build "github.com/grafana/grafana-plugin-sdk-go/build"
)

// Default configures the default target.
var Default = build.BuildAll
