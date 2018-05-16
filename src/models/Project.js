'use strict';

const mongoose = require('mongoose');

module.exports = function(formio) {
  // Include the hook system.
  const hook = require('../util/hook')(formio);

  /**
   * The Schema for Projects.
   *
   * @type {exports.Schema}
   */
  const ProjectSchema = hook.alter('projectSchema', new mongoose.Schema({
    title: {
      type: String,
      required: true,
      validate: [
        {
          isAsync: true,
          message: 'Project title must be unique.',
          validator(value, done) {
            const search = hook.alter('projectSearch', {
              title: value,
              deleted: {$eq: null}
            }, this, value);

            // Ignore the id of the role, if this is an update.
            if (this._id) {
              search._id = {
                $ne: this._id
              };
            }

            // Search for roles that exist, with the given parameters.
            mongoose.model('project').findOne(search, function(err, result) {
              if (err || result) {
                return done(false);
              }

              done(true);
            });
          }
        }
      ]
    },
    name: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    template: {
      type: String,
      default: ''
    },
    deleted: {
      type: Number,
      default: null
    },
    access: [formio.schemas.PermissionSchema],
    owner: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'submission',
      index: true,
      default: null,
      set: owner => {
        // Attempt to convert to objectId.
        return formio.util.ObjectId(owner);
      },
      get: owner => {
        return owner ? owner.toString() : owner;
      }
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Custom project settings object.'
    }
  }));

  const model = require('./BaseModel')({
    schema: ProjectSchema
  });

  // Add machineName to the schema.
  model.schema.plugin(require('../plugins/machineName')('project'));

  // Set the default machine name.
  model.schema.machineName = function(document, done) {
    return hook.alter('projectMachineName', document.title.toLowerCase(), document, done);
  };

  // Return the defined roles and permissions functions.
  return model;
};
