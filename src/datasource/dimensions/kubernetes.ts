// Kubernetes Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.KUBERNETES, [
  ['Source Kubernetes Pod Name', 'kt_k8s_src_pod_name'],
  ['Source Kubernetes Pod Namespace', 'kt_k8s_src_pod_ns'],
  ['Source Kubernetes Workload Name', 'kt_k8s_src_load_name'],
  ['Source Kubernetes Workload Namespace', 'kt_k8s_src_load_ns'],
  ['Source Kubernetes Service Name', 'kt_k8s_src_svc_name'],
  ['Source Kubernetes Service Namespace', 'kt_k8s_src_svc_ns'],
  ['Destination Kubernetes Pod Name', 'kt_k8s_dst_pod_name'],
  ['Destination Kubernetes Pod Namespace', 'kt_k8s_dst_pod_ns'],
  ['Destination Kubernetes Workload Name', 'kt_k8s_dst_load_name'],
  ['Destination Kubernetes Workload Namespace', 'kt_k8s_dst_load_ns'],
  ['Destination Kubernetes Service Name', 'kt_k8s_dst_svc_name'],
  ['Destination Kubernetes Service Namespace', 'kt_k8s_dst_svc_ns'],
]);
