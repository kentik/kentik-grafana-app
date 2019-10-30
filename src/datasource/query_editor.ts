import { showAlert } from './alert_helper';

import { QueryCtrl } from 'grafana/app/plugins/sdk';
import { UiSegmentSrv, MetricSegment } from 'grafana/app/core/services/segment_srv';
import { TemplateSrv } from 'grafana/app/features/templating/template_srv';

import * as _ from 'lodash';

const HOSTNAME_LOOKUP_TEMPLATE_VAR = '$dns_lookup';
const HOSTNAME_LOOKUP_CHOICES = [
  'enabled',
  'disabled'
];

class KentikQueryCtrl extends QueryCtrl {
  static templateUrl: string;
  queryModes: Array<{ value: string; text: string }>;
  metricSegment: MetricSegment;
  deviceSegment: MetricSegment;
  unitSegment: MetricSegment;
  hostnameLookup: MetricSegment;

  /** @ngInject */
  constructor(
    $scope: ng.IScope,
    $injector: ng.auto.IInjectorService,
    public templateSrv: TemplateSrv,
    public uiSegmentSrv: UiSegmentSrv
  ) {
    super($scope, $injector);

    this.target.mode = this.target.mode || 'graph';

    this.queryModes = [{ value: 'graph', text: 'Graph' }, { value: 'table', text: 'Table' }];

    if (this.target.metric === undefined) {
      this.metricSegment = this.uiSegmentSrv.newSegment({ value: 'select metric', fake: true });
    } else {
      const metric = this.datasource.findMetric({ value: this.target.metric });
      if (metric !== null) {
        this.metricSegment = this.uiSegmentSrv.newSegment({ value: metric.text });
      } else {
        this.metricSegment = this.uiSegmentSrv.newSegment({ value: this.target.metric });
      }
    }

    if (this.target.device === undefined) {
      this.deviceSegment = this.uiSegmentSrv.newSegment({ value: 'select device', fake: true });
    } else {
      this.deviceSegment = this.uiSegmentSrv.newSegment({ value: this.target.device });
    }

    if (this.target.unit === undefined) {
      this.unitSegment = this.uiSegmentSrv.newSegment({ value: 'select unit', fake: true });
    } else {
      const unit = this.datasource.findUnit({ value: this.target.unit });
      if (unit !== null) {
        this.unitSegment = this.uiSegmentSrv.newSegment({ value: unit.text });
      } else {
        this.unitSegment = this.uiSegmentSrv.newSegment({ value: this.target.unit });
      }
    }

    if (this.target.hostnameLookup === undefined) {
      this.target.hostnameLookup = HOSTNAME_LOOKUP_TEMPLATE_VAR;
      this.hostnameLookup = this.uiSegmentSrv.newSegment({ value: HOSTNAME_LOOKUP_TEMPLATE_VAR });
    } else {
      this.hostnameLookup = this.hostnameLookup = this.uiSegmentSrv.newSegment({ value: this.target.hostnameLookup });
    }
  }

  async getMetricSegments(query: string, variableName?: string, addTemplateVars = false): Promise<MetricSegment[]> {
    let metrics = await this.datasource.metricFindQuery(query);
    if (this.templateSrv.variableExists(variableName)) {
      metrics = [{ text: variableName }, ...metrics];
    }

    return this.uiSegmentSrv.transformToSegments(addTemplateVars)(metrics);
  }

  async getMetrics(): Promise<MetricSegment[]> {
    return this.getMetricSegments('metrics()', '$metric');
  }

  async getDevices(): Promise<MetricSegment[]> {
    return this.getMetricSegments('devices()', '$device');
  }

  async getUnits(): Promise<MetricSegment[]> {
    return this.getMetricSegments('units()', '$unit');
  }

  async getHostnameLookupOptionValues(): Promise<MetricSegment[]> {
    let choises = HOSTNAME_LOOKUP_CHOICES;
    if (this.templateSrv.variableExists(HOSTNAME_LOOKUP_TEMPLATE_VAR)) {
      choises = [HOSTNAME_LOOKUP_TEMPLATE_VAR, ...choises];
    }

    return this.uiSegmentSrv.transformToSegments(false)(choises.map(c => {
      return { text: c };
    }) as any[]);
  }

  async onMetricChange(): Promise<void> {
    const metric = await this.datasource.findMetric({ text: this.metricSegment.value });
    if (metric !== null) {
      this.target.metric = metric.value;
    } else {
      this.target.metric = this.metricSegment.value;
    }

    this.panelCtrl.refresh();
  }

  async onDeviceChange(): Promise<void> {
    this.target.device = this.deviceSegment.value;

    this.panelCtrl.refresh();
  }

  async onUnitChange(): Promise<void> {
    const unit = await this.datasource.findUnit({ text: this.unitSegment.value });
    if (unit !== null) {
      this.target.unit = unit.value;
    } else {
      this.target.unit = this.unitSegment.value;
    }

    this.panelCtrl.refresh();
  }

  async onHostnameLookupChange(): Promise<void> {
    const choices = HOSTNAME_LOOKUP_CHOICES;
    if ([HOSTNAME_LOOKUP_TEMPLATE_VAR, ...choices].includes(this.hostnameLookup.value)) {
      this.target.hostnameLookup = this.hostnameLookup.value;
      this.panelCtrl.refresh();
    } else {
      if (!choices.includes(this.hostnameLookup.value)) {
        showAlert(
          `${this.hostnameLookup.value} isn't valid hostname lookup value. Use one of ${['enable', 'disable']}`
        );
      }
    }
  }
}

KentikQueryCtrl.templateUrl = 'datasource/query_editor.html';

export { KentikQueryCtrl };
