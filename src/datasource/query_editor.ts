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

type QueryFilter = {
  keySegment: MetricSegment,
  operatorSegment?: MetricSegment,
  valueSegment?: MetricSegment,
  conjunctionOperator?: string,
};


class KentikQueryCtrl extends QueryCtrl {
  static templateUrl: string;
  queryModes: Array<{ value: string; text: string }>;
  metricSegment: MetricSegment;
  deviceSegment: MetricSegment;
  siteSegment: MetricSegment;
  unitSegment: MetricSegment;
  hostnameLookup: MetricSegment;
  conjunctionSegment?: MetricSegment;
  filterList: QueryFilter[] = [];

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

    if (this.target.site === undefined) {
      this.siteSegment = this.uiSegmentSrv.newSegment({ value: 'select site', fake: true });
    } else {
      this.siteSegment = this.uiSegmentSrv.newSegment({ value: this.target.site });
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

    if (this.target.customFilters !== undefined) {
      this.filterList = _.map(this.target.customFilters, filter => {
        const valueSegment = filter.valueSegment ? this.uiSegmentSrv.newSegment({ value: filter.valueSegment?.value }) : undefined;
        const operatorSegment = filter.operatorSegment ? this.uiSegmentSrv.newOperator(filter.operatorSegment?.value) : undefined;
        return {
          keySegment: this.uiSegmentSrv.newSegment({ value: filter.keySegment?.value }),
          operatorSegment,
          valueSegment,
          conjunctionOperator: filter.conjunctionOperator,
        };
      });
    }
    if (this.target.conjunctionOperator !== undefined) {
      this.conjunctionSegment = this.uiSegmentSrv.newCondition(this.target.conjunctionOperator);
    }
    this.target.prefix = this.target.prefix || '';
  }

  async getMetricSegments(query: string, variableName?: string, addTemplateVars = false): Promise<MetricSegment[]> {
    let metrics = await this.datasource.metricFindQuery(query, this.target);
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

  async getSites(): Promise<MetricSegment[]> {
    return this.getMetricSegments('sites()');
  }

  async getUnits(): Promise<MetricSegment[]> {
    return this.getMetricSegments('units()', '$unit');
  }

  addFilter(): void {
    this.filterList.push({
      keySegment: this.uiSegmentSrv.newSegment({ value: 'select field' }),
    });
    if (this.filterList.length > 1) {
      this.conjunctionSegment = this.uiSegmentSrv.newCondition('AND');
      this.filterList[this.filterList.length - 2].conjunctionOperator = this.conjunctionSegment?.value;
    }
    this.target.conjunctionOperator = this.conjunctionSegment?.value;
    this.onFilterListChange();
  }

  deleteFilter(filterIdx: number): void {
    this.filterList.splice(filterIdx, 1);
    // @ts-ignore
    _.last(this.filterList)?.conjunctionOperator = undefined;
    if (this.filterList.length <= 1) {
      this.conjunctionSegment = undefined;
    }
    this.target.conjunctionOperator = this.conjunctionSegment?.value;
    this.onFilterListChange();
  }

  onPrefixChange(): void {
    this.panelCtrl.refresh();
  }

  async getFilterOptionValues(filterIndex: number): Promise<MetricSegment[]> {
    const variables = _.map(this.templateSrv.variables, variable => `$${variable.name}`);
    const formattedVariables = _.map(variables, v => ({ text: v }));
    const values = await this.datasource.getTagValues({ key: this.filterList[filterIndex].keySegment.value });
    const options = [...formattedVariables, ...values];
    return this.uiSegmentSrv.transformToSegments(false)(options);
  }

  async getFilterOptionKeys(): Promise<MetricSegment[]> {
    const variables = _.map(this.templateSrv.variables, variable => `$${variable.name}`);
    const formattedVariables = _.map(variables, v => ({ text: v }));
    const keys = await this.datasource.getTagKeys();
    const options = [...formattedVariables, ...keys];
    return this.uiSegmentSrv.transformToSegments(false)(options);
  }

  async getOperatorOptionValues(): Promise<MetricSegment[]> {
    const options = ['=', '!=', '<', '<=', '>', '>='];

    return this.uiSegmentSrv.transformToSegments(false)(options.map(o => {
      return { text: o };
    }) as any[]);
  }

  async getConditionsOptionValues(): Promise<MetricSegment[]> {
    const options = ['AND', 'OR'];

    return this.uiSegmentSrv.transformToSegments(false)(options.map(o => {
      return { text: o };
    }) as any[]);
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

  async onSiteChange(): Promise<void> {
    this.target.site = this.siteSegment.value;

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

  async onFilterInputChange(
    idx: number, field: 'keySegment' | 'operatorSegment' | 'valueSegment' | 'conjunctionSegment'
  ): Promise<void> {
    if (field === 'keySegment' && this.filterList[idx].operatorSegment === undefined) {
      this.filterList[idx].operatorSegment = this.uiSegmentSrv.newOperator('=');
    }
    if (field === 'keySegment' && this.filterList[idx].valueSegment === undefined) {
      this.filterList[idx].valueSegment = this.uiSegmentSrv.newSegment({ value: 'none' });
    }
    this.onFilterListChange();
  }

  async onConjunctionSegmentChange(): Promise<void> {
    this.filterList.forEach(filter => {
      if (filter.conjunctionOperator !== undefined) {
        filter.conjunctionOperator = this.conjunctionSegment?.value;
      }
    });
    this.target.conjunctionOperator = this.conjunctionSegment?.value;
    this.onFilterListChange();
  }

  onFilterListChange(): void {
    this.target.customFilters = this.filterList;
    this.panelCtrl.refresh();
  }
}

KentikQueryCtrl.templateUrl = 'datasource/query_editor.html';

export { KentikQueryCtrl };
