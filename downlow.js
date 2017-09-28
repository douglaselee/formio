'use strict';

var async = require('async');
var fs = require('fs-extra');
var util = require('./src/util/util');
var debug = require('debug')('formio:error');
var path = require('path');

module.exports = function(formio, items, done) {
  // The project that was created.
  var project = {};

  // The directory for the client application.
  var directories = {
    client: path.join(__dirname, 'client')
  };

  var templateFile = '';

  // All the steps in the installation.
  var steps = {
    /**
     * Select the template to use.
     *
     * @param done
     * @return {*}
     */
    whatTemplate: function(done) {
        templateFile = 'client/dist/project.json';
        done();
    },

    /**
     * Import the template.
     * @param done
     */
    importTemplate: function(done) {
      if (!items.import) {
        return done();
      }

      // Determine if this is a custom project.
      var customProject = (['app', 'client'].indexOf(templateFile) === -1);
      var directoryPath = '';

      if (!customProject) {
        directoryPath = directories[templateFile];
        // Get the package json file.
        var info = {};
        try {
          info = JSON.parse(fs.readFileSync(path.join(directoryPath, 'package.json')));
        }
        catch (err) {
          debug(err);
          return done(err);
        }

        // Change the document root if we need to.
        if (info.formio && info.formio.docRoot) {
          directoryPath = path.join(directoryPath, info.formio.docRoot);
        }
      }

      var projectJson = customProject ? templateFile : path.join(directoryPath, 'project.json');
      if (!fs.existsSync(projectJson)) {
        util.log(projectJson);
        return done('Missing project.json file'.red);
      }

      var template = {};
      try {
        template = JSON.parse(fs.readFileSync(projectJson));
      }
      catch (err) {
        debug(err);
        return done(err);
      }

      // Get the form.io service.
      util.log('Importing template...'.green);
      var importer = require('./src/templates/import')({formio: formio});
      importer.template(template, function(err, template) {
        if (err) {
          return done(err);
        }

        project = template;
        done(null, template);
      });
    },

    /**
     * Create the root user object.
     *
     * @param done
     */
    createRootUser: function(done) {
      if (!items.user) {
        return done();
      }
      util.log('Creating root user account...'.green);
      util.log('Encrypting password');
      formio.encrypt(process.argv[4], function(err, hash) {
        if (err) {
          return done(err);
        }

        // Create the root user submission.
        util.log('Creating root user account');
        formio.resources.submission.model.create({
          form: project.resources.admin._id,
          data: {
            name:  process.argv[2],
            email: process.argv[3],
            password: hash
          },
          roles: [
            project.roles.administrator._id
          ]
        }, function(err, item) {
          if (err) {
            return done(err);
          }

          done();
        });
      });
    }
  };

  util.log('Installing...');
  async.series([
    steps.whatTemplate,
    steps.importTemplate,
    steps.createRootUser
  ], function(err, result) {
    if (err) {
      util.log(err);
      return done(err);
    }

    util.log('Install successful!'.green);
    process.exit(0);
  });
};
