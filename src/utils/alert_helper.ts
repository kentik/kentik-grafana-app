import { getAppEvents } from '@grafana/runtime';
import * as _ from 'lodash';

const appEvents = getAppEvents();

/**
 * Match Kentik v5 API "Value <name> is not valid" errors and classify them.
 *
 * The API returns the same generic error for two very different conditions:
 *   1. A column/metric/dimension name the API has never heard of (real bug —
 *      typically a typo in plugin code or a stale catalogue entry).
 *   2. A column the API knows about, but which has no data in the calling
 *      account — most commonly SNMP/NMS telemetry columns
 *      (`ktappprotocol__snmp__*`, `ktappprotocol__snmp_device_metrics__*`)
 *      on accounts that haven't enabled NMS polling yet.
 *
 * We classify by name shape so we can show users an actionable message.
 */
const NOT_VALID_RE = /Value\s+([A-Za-z0-9_]+)\s+is not valid/i;

interface ClassifiedError {
  /** The offending column name parsed from the API message. */
  column: string;
  /** Title shown in the toast. */
  title: string;
  /** Friendly explanation shown to the user. */
  message: string;
}

function classifyNotValid(rawError: string): ClassifiedError | null {
  const match = rawError.match(NOT_VALID_RE);
  if (!match) {
    return null;
  }
  const column = match[1];

  // SNMP device-level metrics (CPU, memory, sysUptime, etc.)
  // These columns are populated by the legacy kproxy SNMP poller, which is
  // being deprecated. Accounts that haven't ever run kproxy SNMP polling
  // will not have these columns provisioned.
  if (column.startsWith('ktappprotocol__snmp_device_metrics__')) {
    return {
      column,
      title: 'Legacy SNMP device metric unavailable',
      message:
        `Metric "${column}" is not available in this account. ` +
        `These dashboard panels rely on Kentik's legacy kproxy SNMP device ` +
        `polling (CPU, memory, etc.), which is being deprecated within the ` +
        `next year. The column is only provisioned for accounts that have ` +
        `historically used kproxy SNMP polling. New deployments should use ` +
        `Kentik NMS for device telemetry.`,
    };
  }

  // SNMP interface metrics (utilisation, errors, discards, etc.)
  if (column.startsWith('ktappprotocol__snmp__')) {
    return {
      column,
      title: 'Legacy SNMP interface metric unavailable',
      message:
        `Metric "${column}" is not available in this account. ` +
        `These dashboard panels rely on Kentik's legacy kproxy SNMP interface ` +
        `polling, which is being deprecated within the next year. The column ` +
        `is only provisioned for accounts that have historically used kproxy ` +
        `SNMP polling. New deployments should use Kentik NMS for interface ` +
        `telemetry.`,
    };
  }

  // Other application-protocol telemetry (DNS, BGP, NetFlow templates, etc.)
  if (column.startsWith('ktappprotocol__')) {
    const namespace = column.split('__')[1] ?? 'application protocol';
    return {
      column,
      title: `${namespace} telemetry unavailable`,
      message:
        `Metric "${column}" is not available in this account. ` +
        `This panel uses ${namespace} telemetry which has not been ingested ` +
        `for the configured account. Other panels using flow data should ` +
        `continue to work.`,
    };
  }

  // Otherwise it really does look like a bad name — surface the raw error.
  return null;
}

function buildMessage(error: any): { title: string; message: string } {
  // Extract the raw API error string if present
  let rawMessage = '';
  if (error?.data?.error) {
    rawMessage = String(error.data.error);
  } else if (error?.err) {
    rawMessage = String(error.err);
  } else if (_.isString(error)) {
    rawMessage = error;
  }

  // Try to classify "is not valid" responses into something more actionable
  const classified = classifyNotValid(rawMessage);
  if (classified) {
    return { title: classified.title, message: classified.message };
  }

  let message = '';
  message += error?.status ? `(${error.status}) ` : '';
  message += error?.statusText ? error.statusText + ': ' : '';
  message += rawMessage;
  return { title: 'Kentik API Error', message };
}

function showAlert(error: any) {
  const { title, message } = buildMessage(error);
  appEvents.publish({
    type: 'alert-error',
    payload: [title, message],
  });
}

function showCustomAlert(message: string, exceptionData: any, exceptionType: any) {
  let errMessage = '';
  errMessage += exceptionData.status ? `(${exceptionData.status}) ` : '';
  errMessage += exceptionData.statusText ? exceptionData.statusText + ': ' : '';
  if (exceptionData.data && exceptionData.data.error) {
    errMessage += exceptionData.data.error;
  } else if (exceptionData.err) {
    errMessage += exceptionData.err;
  } else if (_.isString(exceptionData)) {
    errMessage += exceptionData;
  }
  appEvents.publish({type: `alert-${exceptionType}`, payload: [message, errMessage]});
}

export { showAlert, showCustomAlert };
