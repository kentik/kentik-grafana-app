define(["lodash","angular","app/core/core","app/plugins/sdk"],function(t,e,n,r){return function(t){var e={};function n(r){if(e[r])return e[r].exports;var o=e[r]={i:r,l:!1,exports:{}};return t[r].call(o.exports,o,o.exports,n),o.l=!0,o.exports}return n.m=t,n.c=e,n.d=function(t,e,r){n.o(t,e)||Object.defineProperty(t,e,{enumerable:!0,get:r})},n.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},n.t=function(t,e){if(1&e&&(t=n(t)),8&e)return t;if(4&e&&"object"==typeof t&&t&&t.__esModule)return t;var r=Object.create(null);if(n.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:t}),2&e&&"string"!=typeof t)for(var o in t)n.d(r,o,function(e){return t[e]}.bind(null,o));return r},n.n=function(t){var e=t&&t.__esModule?function(){return t.default}:function(){return t};return n.d(e,"a",e),e},n.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},n.p="",n(n.s=14)}([function(e,n){e.exports=t},function(t,n){t.exports=e},function(t,e,n){"use strict";n.d(e,"a",function(){return s}),n.d(e,"b",function(){return l});var r=n(3),o=n(0),i=n(1),u=n.n(i),a=function(t,e,n,r){return new(n||(n=Promise))(function(o,i){function u(t){try{c(r.next(t))}catch(t){i(t)}}function a(t){try{c(r.throw(t))}catch(t){i(t)}}function c(t){t.done?o(t.value):new n(function(e){e(t.value)}).then(u,a)}c((r=r.apply(t,e||[])).next())})},c=function(t,e){var n,r,o,i,u={label:0,sent:function(){if(1&o[0])throw o[1];return o[1]},trys:[],ops:[]};return i={next:a(0),throw:a(1),return:a(2)},"function"==typeof Symbol&&(i[Symbol.iterator]=function(){return this}),i;function a(i){return function(a){return function(i){if(n)throw new TypeError("Generator is already executing.");for(;u;)try{if(n=1,r&&(o=2&i[0]?r.return:i[0]?r.throw||((o=r.return)&&o.call(r),0):r.next)&&!(o=o.call(r,i[1])).done)return o;switch(r=0,o&&(i=[2&i[0],o.value]),i[0]){case 0:case 1:o=i;break;case 4:return u.label++,{value:i[1],done:!1};case 5:u.label++,r=i[1],i=[0];continue;case 7:i=u.ops.pop(),u.trys.pop();continue;default:if(!(o=(o=u.trys).length>0&&o[o.length-1])&&(6===i[0]||2===i[0])){u=0;continue}if(3===i[0]&&(!o||i[1]>o[0]&&i[1]<o[3])){u.label=i[1];break}if(6===i[0]&&u.label<o[1]){u.label=o[1],o=i;break}if(o&&u.label<o[2]){u.label=o[2],u.ops.push(i);break}o[2]&&u.ops.pop(),u.trys.pop();continue}i=e.call(t,u)}catch(t){i=[6,t],r=0}finally{n=o=0}if(5&i[0])throw i[1];return{value:i[0]?i[1]:void 0,done:!0}}([i,a])}}},s=function(){function t(t){this.backendSrv=t,this.baseUrl="api/plugin-proxy/kentik-app"}return t.$inject=["backendSrv"],t.prototype.getDevices=function(){return a(this,void 0,void 0,function(){var t;return c(this,function(e){switch(e.label){case 0:return[4,this._get("/api/v5/devices")];case 1:return(t=e.sent()).data&&t.data.devices?[2,t.data.devices]:[2,[]]}})})},t.prototype.getUsers=function(){return this._get("/api/v5/users")},t.prototype.getFieldValues=function(t){var e="SELECT DISTINCT "+t+" FROM all_devices ORDER BY "+t+" ASC";return this.invokeSQLQuery(e)},t.prototype.getCustomDimensions=function(){return a(this,void 0,void 0,function(){return c(this,function(t){switch(t.label){case 0:return[4,this._get("/api/v5/customdimensions")];case 1:return[2,t.sent().data.customDimensions]}})})},t.prototype.getSavedFilters=function(){return a(this,void 0,void 0,function(){return c(this,function(t){switch(t.label){case 0:return[4,this._get("/api/v5/saved-filters")];case 1:return[2,t.sent().data]}})})},t.prototype.invokeTopXDataQuery=function(t){var e={queries:[{query:t,bucketIndex:0}]};return this._post("/api/v5/query/topXdata",e)},t.prototype.invokeSQLQuery=function(t){var e={query:t};return this._post("/api/v5/query/sql",e)},t.prototype._get=function(t){return this.backendSrv.datasourceRequest({method:"GET",url:this.baseUrl+t}).catch(function(t){return console.error(t),t.err?Promise.reject(t.err):Promise.reject(t)})},t.prototype._post=function(t,e){return this.backendSrv.datasourceRequest({method:"POST",url:this.baseUrl+t,data:e}).then(function(t){return t.data?t.data:[]}).catch(function(t){return console.error(t),t.err?Promise.reject(t.err):Promise.reject(t)})},t}();function l(t){var e="";e+=t.status?"("+t.status+") ":"",e+=t.statusText?t.statusText+": ":"",t.data&&t.data.error?e+=t.data.error:t.err?e+=t.err:o.isString(t)&&(e+=t),r.appEvents.emit("alert-error",["Can't connect to Kentik API",e])}u.a.module("grafana.services").service("kentikAPISrv",s)},function(t,e){t.exports=n},function(t,e){t.exports=r},,,,,,,,,,function(t,e,n){"use strict";n.r(e),n.d(e,"PanelCtrl",function(){return l});var r=n(2),o=n(4),i=n(0),u=function(){var t=function(e,n){return(t=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e}||function(t,e){for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n])})(e,n)};return function(e,n){function r(){this.constructor=e}t(e,n),e.prototype=null===n?Object.create(n):(r.prototype=n.prototype,new r)}}(),a=function(t,e,n,r){return new(n||(n=Promise))(function(o,i){function u(t){try{c(r.next(t))}catch(t){i(t)}}function a(t){try{c(r.throw(t))}catch(t){i(t)}}function c(t){t.done?o(t.value):new n(function(e){e(t.value)}).then(u,a)}c((r=r.apply(t,e||[])).next())})},c=function(t,e){var n,r,o,i,u={label:0,sent:function(){if(1&o[0])throw o[1];return o[1]},trys:[],ops:[]};return i={next:a(0),throw:a(1),return:a(2)},"function"==typeof Symbol&&(i[Symbol.iterator]=function(){return this}),i;function a(i){return function(a){return function(i){if(n)throw new TypeError("Generator is already executing.");for(;u;)try{if(n=1,r&&(o=2&i[0]?r.return:i[0]?r.throw||((o=r.return)&&o.call(r),0):r.next)&&!(o=o.call(r,i[1])).done)return o;switch(r=0,o&&(i=[2&i[0],o.value]),i[0]){case 0:case 1:o=i;break;case 4:return u.label++,{value:i[1],done:!1};case 5:u.label++,r=i[1],i=[0];continue;case 7:i=u.ops.pop(),u.trys.pop();continue;default:if(!(o=(o=u.trys).length>0&&o[o.length-1])&&(6===i[0]||2===i[0])){u=0;continue}if(3===i[0]&&(!o||i[1]>o[0]&&i[1]<o[3])){u.label=i[1];break}if(6===i[0]&&u.label<o[1]){u.label=o[1],o=i;break}if(o&&u.label<o[2]){u.label=o[2],u.ops.push(i);break}o[2]&&u.ops.pop(),u.trys.pop();continue}i=e.call(t,u)}catch(t){i=[6,t],r=0}finally{n=o=0}if(5&i[0])throw i[1];return{value:i[0]?i[1]:void 0,done:!0}}([i,a])}}};Object(o.loadPluginCss)({dark:"plugins/kentik-app/css/kentik.dark.css",light:"plugins/kentik-app/css/kentik.light.css"});var s={fullscreen:!0},l=function(t){function e(e,n,o,u){var a=t.call(this,e,n)||this;return a.$location=o,a.backendSrv=u,a.devices=[],a.pageReady=!1,a.kentik=new r.a(a.backendSrv),a.getDevices(),i.defaults(a.panel,s),a}return u(e,t),e.$inject=["$scope","$injector","$location","backendSrv"],e.prototype.getDevices=function(){return a(this,void 0,void 0,function(){var t,e;return c(this,function(n){switch(n.label){case 0:return n.trys.push([0,2,,3]),t=this,[4,this.kentik.getDevices()];case 1:return t.devices=n.sent(),this.pageReady=!0,[3,3];case 2:return e=n.sent(),Object(r.b)(e),[3,3];case 3:return[2]}})})},e.prototype.refresh=function(){this.getDevices()},e.prototype.gotoDashboard=function(t){this.$location.path("/dashboard/db/kentik-top-talkers").search({"var-device":t.device_name})},e.prototype.gotoDeviceDetail=function(t){this.$location.url("/plugins/kentik-app/page/device-details?device="+t.id)},e}(o.PanelCtrl);l.templateUrl="public/plugins/kentik-app/components/device_list.html"}])});
//# sourceMappingURL=module.js.map