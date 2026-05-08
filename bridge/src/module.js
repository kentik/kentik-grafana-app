define(["@grafana/data"], function (grafanaData) {
  "use strict";
  return { plugin: new grafanaData.AppPlugin() };
});
