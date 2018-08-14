'use strict';

const async = require('async');
const _ = require('lodash');
const util = require('../util/util');
const EVERYONE = '000000000000000000000000';

/**
 * Perform an export of a specified template.
 *
 * @param {Object} router
 *   The express router object.
 */
module.exports = (router) => {
  const formio = router.formio;
  const hook = require('../util/hook')(formio);

  // Assign the role ids.
  const assignRoles = function(_map, perms) {
    _.each(perms, function(access) {
      _.each(access.roles, function(roleId, i) {
        roleId = roleId.toString();
        if (roleId === EVERYONE) {
          access.roles[i] = 'everyone';
        }
        else if (_map.roles && _map.roles.hasOwnProperty(roleId)) {
          access.roles[i] = _map.roles[roleId];
        }
      });
    });
  };

  // Assign the role to an entity.
  const assignRole = function(_map, entity) {
    if (!entity) {
      return;
    }

    if (entity.hasOwnProperty('role')) {
      if (entity.role.toString() === EVERYONE) {
        entity.role = 'everyone';
      }
      else if (_map.roles && _map.roles.hasOwnProperty(entity.role)) {
        entity.role = _map.roles[entity.role];
      }
    }
  };

  // Assign the resources.
  const assignResources = function(_map, entity) {
    if (!entity || !entity.resources) {
      return;
    }
    _.each(entity.resources, function(resource, index) {
      if (_map.forms && _map.forms.hasOwnProperty(resource)) {
        entity.resources[index] = _map.forms[resource];
      }
    });
  };

  // Assign the resource of an entity.
  const assignResource = function(_map, entity) {
    if (!entity || !entity.resource) {
      return;
    }
    if (_map.forms && _map.forms.hasOwnProperty(entity.resource)) {
      entity.resource = _map.forms[entity.resource];
    }
  };

  // Assign form.
  const assignForm = function(_map, entity) {
    if (!entity) {
      return;
    }
    if (entity.hasOwnProperty('form')) {
      if (_map.forms && _map.forms.hasOwnProperty(entity.form)) {
        entity.form = _map.forms[entity.form];
      }
    }
  };

  // Export actions.
  const exportActions = function(_export, _map, options, next) {
    formio.actions.model.find({
        form: {$in: _.keys(_map.forms)},
        deleted: {$eq: null}
      })
      .lean(true)
      .exec(function(err, actions) {
        if (err) {
          return next(err);
        }
        _.each(actions, function(action, index) {
          assignForm(_map, action);
          assignRole(_map, action.settings);
          assignResource(_map, action.settings);
          assignResources(_map, action.settings);
          const machineName = action.machineName = hook.alter('machineNameExport', action.machineName);
          _export.actions[machineName] = _.pick(action,
            'title',
            'name',
            'form',
            'condition',
            'settings',
            'priority',
            'method',
            'handler'
          );
        });
        next();
      });
  };

  // Export forms.
  const exportForms = function(_export, _map, options, next) {
    formio.resources.form.model
      .find(hook.alter('formQuery', {deleted: {$eq: null}}, options))
      .lean(true)
      .exec(function(err, forms) {
        if (err) {
          return next(err);
        }
        _.each(forms, function(form) {
          if (!form || !form._id) {
            return;
          }
          assignRoles(_map, form.access);
          assignRoles(_map, form.submissionAccess);
          const machineName = form.machineName = hook.alter('machineNameExport', form.machineName);
          _export[`${form.type}s`][machineName] = _.pick(form,
            'title',
            'type',
            'name',
            'path',
            'display',
            'action',
            'tags',
            'settings',
            'components',
            'access',
            'submissionAccess'
          );
          _map.forms[form._id.toString()] = machineName;
        });

        // Now assign the form and resource components.
        _.each(forms, function(form) {
          util.eachComponent(form.components, function(component) {
            assignForm(_map, component);
            assignForm(_map, component.data);
            assignResource(_map, component);
            assignResource(_map, component.data);
            if (component && component.data && component.data.project) {
              component.data.project = 'project';
            }
            if (component && component.project) {
              component.project = 'project';
            }

            // Allow hooks to alter fields.
            hook.alter('exportComponent', component);
          });
        });
        next();
      });
  };

  // Export the roles.
  const exportRoles = function(_export, _map, options, next) {
    formio.resources.role.model
      .find(hook.alter('roleQuery', {deleted: {$eq: null}}, options))
      .lean(true)
      .exec(function(err, roles) {
        if (err) {
          return next(err);
        }
        _.each(roles, function(role) {
          if (!role || !role._id) {
            return;
          }
          const machineName = role.machineName = hook.alter('machineNameExport', role.machineName);
          _export.roles[machineName] = _.pick(role,
            'title',
            'description',
            'admin',
            'default'
          );
          _map.roles[role._id.toString()] = machineName;
        });

        next();
      });
  };

  // Mark the action and its dependencies as needing to be kept
  var keepAction = function(action, template) {
    if (action.keep) {
      return;
    }

    // Keep the action
    action.keep = true;

    // Keep the role referred to by the action
    if (action.settings
    &&  action.settings.role) {
      template.roles[action.settings.role].keep = true;
    }

    // Keep the resources referred to by the action
    /* eslint-disable no-use-before-define */
    if (action.settings
    &&  action.settings.resource) {
      keepResource(action.settings.resource, template);
    }
    if (action.settings
    &&  action.settings.resources) {
      _.each(action.settings.resources, function(resource) {
        keepResource(resource, template);
      });
    }
    /* eslint-enable no-use-before-define */
  };

  // Mark the form or resource and its dependencies as needing to be kept
  var keepResource = function(machineName, template) {
    var entity =   template.forms[machineName];
    if (entity === undefined) {
        entity =   template.resources[machineName];
    }
    if (entity === undefined || entity.keep) {
      return;
    }

    // Keep the form or resource
    entity.keep = true;

    // Keep the roles with form access
    _.each(entity.access, function(access) {
      _.each(access.roles, function(role) {
        if (template.roles[role]) {
            template.roles[role].keep = true;
        }
      });
    });

    // Keep the roles with submission access
    _.each(entity.submissionAccess, function(access) {
      _.each(access.roles, function(role) {
        if (template.roles[role]) {
            template.roles[role].keep = true;
        }
      });
    });

    // Keep the forms and resources referred to by components
    util.eachComponent(entity.components, function(component) {
      if (component.type === 'form') {
        keepResource(component.form, template);
      }

      if (component.type === 'resource') {
        keepResource(component.resource, template);
      }

      if (component.type    === 'select'
      &&  component.dataSrc === 'resource'
      &&  component.data
      &&  component.data.resource) {
        keepResource(component.data.resource, template);
      }
    });

    // Keep the actions that refer to this form or resource
    _.each(template.actions, function(action, index) {
      if (action.form === machineName) {
        keepAction(action, template);
      }
    });
  };

  // Delete unmarked entities from collection object
  var deleteUnmarked = function(entities) {
    _.each(entities, function(entity, index) {
      if (entity.keep) {
        delete entity.keep;
      }
      else {
        delete entities[index];
      }
    });
  };

  /**
   * Export the formio template.
   *
   * Note: This is all of the core entities, not submission data.
   */
  const exportTemplate = (options, next) => {
    const template = hook.alter('defaultTemplate', Object.assign({
      title: 'Export',
      version: '2.0.0',
      description: '',
      name: 'export',
      roles: {},
      forms: {},
      actions: {},
      resources: {}
    }, _.pick(options, ['title', 'version', 'description', 'name'])), options);

    // Memoize resource mapping.
    const map = {
      roles: {},
      forms: {}
    };

    // Export the roles forms and actions.
    async.series(hook.alter(`templateExportSteps`, [
      async.apply(exportRoles, template, map, options),
      async.apply(exportForms, template, map, options),
      async.apply(exportActions, template, map, options)
    ], template, map, options), (err) => {
      if (err) {
        return next(err);
      }

      if (options._id !== '0') {
        // Mark what needs to be kept
        keepResource(map.forms[options._id], template);

        // Delete what doesn't
        deleteUnmarked(template.roles);
        deleteUnmarked(template.forms);
        deleteUnmarked(template.resources);
        deleteUnmarked(template.actions);
      }

      // Send the export.
      return next(null, template);
    });
  };

  // Add the export endpoint
  if (router.get) {
    router.get('/export/:_id', (req, res, next) => {
      const options = hook.alter('exportOptions', {_id: req.params._id}, req, res);
      exportTemplate(options, (err, data) => {
        if (err) {
          return next(err.message || err);
        }

        res.attachment(`${options.name}-${options.version}.json`);
        res.end(JSON.stringify(data));
      });
    });
  }

  return exportTemplate;
};
