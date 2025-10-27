import { getAppEvents } from '@grafana/runtime';
import * as _ from 'lodash';

const appEvents = getAppEvents();

function showAlert(error: any) {
  let message = '';
  message += error.status ? `(${error.status}) ` : '';
  message += error.statusText ? error.statusText + ': ' : '';
  if (error.data && error.data.error) {
    message += error.data.error;
  } else if (error.err) {
    message += error.err;
  } else if (_.isString(error)) {
    message += error;
  }

  appEvents.publish({
    type: 'alert-error',
    payload: ['Kentik API Error', message],
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
