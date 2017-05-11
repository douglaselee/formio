'use strict';
/*eslint max-statements: 0*/

var debug = require('debug')('formio:middleware:bootstrapSubmissionUpdatedBy');
var _ = require('lodash');

/**
 * The Bootstrap Submission Updated By middleware.
 *
 * This middleware will set the user of the current request as the updater of the submission being updated.
 *
 * @param router
 */
module.exports = function(router) {
  return function bootstrapSubmissionUpdatedBy(req, res, next) {
    // Confirm we have a token to access.
    var  tokenPresent = (_.has(req, 'token') && req.token !== null && _.has(req, 'token.user._id'));
    if (!tokenPresent) {
        debug('Skipping, no user in request token');
        return next();
    }

    // Confirm we are only modifying PUT requests.
    var  isPut = (req.method === 'PUT');
    if (!isPut) {
      debug('Skipping, not a PUT request');
      return next();
    }

    // Confirm we are not just modifying access.
    if (req.body.deleted === 0) {
        debug('Skipping, submission access update');
        return next();
    }

    // If the token is present set UpdatedBy in submission's metadata
    _.set(req, 'body.metadata', {UpdatedBy: _.get(req, 'token.user._id')});
    debug('UpdatedBy set in metadata');

    // Clear submission access to avoid conflicts
    _.set(req, 'body.access', []);
    debug('Submission access cleared');

    return next();
  };
};
