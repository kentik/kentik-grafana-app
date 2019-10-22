import { appEvents } from 'grafana/app/core/core';

import * as _ from 'lodash';


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

  appEvents.emit('alert-error', ["Can't connect to Kentik API", message]);
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
  appEvents.emit(`alert-${exceptionType}`, [message, errMessage]);
}

export { showAlert, showCustomAlert };
