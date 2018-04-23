'use strict';

const async = require(`async`);
const _ = require(`lodash`);
const ActiveDirectory  = require('activedirectory');
const ActiveDirectory2 = require('activedirectory2');

/**
 * Perform a synchronization with AD.
 *
 * @param {Object} router
 *   The express router object.
 */
module.exports = (router) => {
  const formio = router.formio;

  // For reporting results
  var newRole;
  var oldRole;
  var newUser;
  var oldUser;

  // For preventing simultaneous synchronizations
  var synchronizing;
  var syncError = 'AD synchronization already in progress!';

  /**
   * Create mongo roles and users for AD groups and users
   */
  const synchronize = (filter, done) => {
    // One at a time!
    if (synchronizing) {
      return done(syncError);
    }
    synchronizing = true;

    // Reset statistics
    newRole = 0;
    oldRole = 0;
    newUser = 0;
    oldUser = 0;

    // IDs of Admin and User resources
    var admForm = '';
    var usrForm = '';

    const model = formio.resources.form.model;
    const query = {
      type: 'resource',
      name: {$in: ['admin', 'user']},
      deleted: {$eq: null}
    };

    // Get id of Admin and User resource
    model.find(query, (err, forms) => {
      if (err) {
        return done(err);
      }

      // Retrieve ids of Admin and User resources
      _.each(forms, function(form) {
        if (form.name === 'admin') {
          admForm = form._id;
        }
        if (form.name === 'user') {
          usrForm = form._id;
        }
      });

      if (!admForm || !usrForm) {
        return done('Admin or User resource not found');
      }

      const model = formio.resources.role.model;
      const query = {
        title: 'Authenticated',
        deleted: {$eq: null}
      };

      // Get id of Authenticated role
      model.findOne(query, (err, doc) => {
        if (err) {
          return done(err);
        }

        if (!doc) {
          return done('Authenticated role not found');
        }

        var authenticatedRoleId = doc._id;
        var config = formio.config.ldap;

        // Be sure we have a configuration
        if (!config) {
          return done('Configuration is missing ldap section');
        }

        // Prepare for manual ou filtering
        config.ou = config.ou || [];
        if (!Array.isArray(config.ou)) {
          config.ou = [config.ou];
        }
        config.ou = config.ou.map(element => element.toLowerCase());

        // Perform manual ou filtering
        config.entryParser = function(entry, raw, callback) {
          if (config.ou.length) {
            // Create array of ous in dn
            var ous = entry.dn.split(',').map(function(element) {
              var parts = element.split('=');
              return parts[0].toLowerCase() === 'ou' ? parts[1].toLowerCase() : null;
            });
            var out = {};

            // Keep entry if ou arrays intersect
            config.ou.forEach(function(element) {
              if (ous.find(ou => ou === element)) {
                out = entry;
              }
            });

            return callback(out);
          }

          callback(entry);
        };

        // We want to retrieve lots more attributes than the defaults
        config.attributes = {
          user: ['ou', 'dn', 'cn', 'description', 'objectGUID', 'name',
            'attributeID', 'attributeSyntax', 'dnReferenceUpdate' , 'dNSHostName' , 'flatName',
            'governsID', 'groupType', 'instanceType', 'lDAPDisplayName', 'legacyExchangeDN',
            'mS-DS-CreatorSID', 'mSMQOwnerID', 'nCName', 'objectClass', 'objectGUID', 'objectSid',
            'oMSyntax', 'proxiedObjectName', 'replPropertyMetaData', 'sAMAccountName', 'securityIdentifier',
            'sIDHistory', 'subClassOf', 'systemFlags', 'trustPartner', 'trustDirection', 'trustType',
            'trustAttributes', 'userAccountControl', 'uSNChanged', 'uSNCreated', 'whenCreated',
            'msDS-AdditionalSam­AccountName', 'msDS-Auxiliary-Classes', 'msDS-Entry-Time-To-Die',
            'msDS-IntId', 'msSFU30NisDomain', 'nTSecurityDescriptor', 'uid', 'mail', 'userPrincipalName'
          ],
          group: ['ou', 'dn', 'cn', 'description', 'objectGUID', 'name',
            'attributeID', 'attributeSyntax', 'dnReferenceUpdate' , 'dNSHostName' , 'flatName',
            'governsID', 'groupType', 'instanceType', 'lDAPDisplayName', 'legacyExchangeDN',
            'mS-DS-CreatorSID', 'mSMQOwnerID', 'nCName', 'objectClass', 'objectGUID', 'objectSid',
            'oMSyntax', 'proxiedObjectName', 'replPropertyMetaData', 'sAMAccountName', 'securityIdentifier',
            'sIDHistory', 'subClassOf', 'systemFlags', 'trustPartner', 'trustDirection', 'trustType',
            'trustAttributes', 'userAccountControl', 'uSNChanged', 'uSNCreated', 'whenCreated',
            'msDS-AdditionalSam­AccountName', 'msDS-Auxiliary-Classes', 'msDS-Entry-Time-To-Die',
            'msDS-IntId', 'msSFU30NisDomain', 'nTSecurityDescriptor', 'uid', 'mail', 'userPrincipalName'
          ]
        };

        var  ad    = new ActiveDirectory(config);
        var  ad2   = new ActiveDirectory2(config);
        if (!ad.opts.bindDN) {
          return done('LDAP options are missing username parameter');
        }
        var split  = ad.opts.bindDN.split('\\');
        var domain = split[0];

        try {
          // Get groups and users from AD
          var query = {
            filter: filter || config.filter || '(objectclass=*)',
            paged: true
          };

          ad2.find(query, function(err, results) {
            if (!err && !results) {
              err = 'Found nothing in AD';
            }

            if (err) {
              if (err.code === 49) {
                return done('Error: user or password is incorrect in default.json file\'s ldap parameters');
              }
              if (err.code === 'ENOTFOUND') {
                return done('Error: url is incorrect in default.json file\'s ldap parameters');
              }
              if (err.code === 'ETIMEDOUT') {
                const part1 = 'AD server is not responding, please check that default.json file\'s ';
                const part2 = 'ldap parameters are correct and that the AD server is up and running';
                return done(part1 + part2);
              }
              return done(err);
            }

            var globalRoles = {}; // To remember their ids

            // Create or update role for an AD group
            const ProcessGroup = function(group, index, next) {
              // Have we already processed this group?
              if (globalRoles[group.sAMAccountName]) {
                return next();
              }

              const model = formio.resources.role.model;
              var title = group.sAMAccountName;

              // What title to use?
              if (!title) {
                return next();
              }

              const query = {
                title: title,
                deleted: {$eq: null}
              };

              // Look for role with same name as AD group
              model.findOne(query, (err, doc) => {
                if (err) {
                  return next(err);
                }

                // Create new or update old role
                const saveDoc = function(updatedDoc) {
                  updatedDoc.save((err, result) => {
                    if (err) {
                      return next(err);
                    }

                    // Remember ids of roles for membership
                    globalRoles[result.title] = result._id;

                    next();
                  });
                };

                if (!doc) {
                  newRole++;
                  /* eslint-disable new-cap */
                  return saveDoc(new model({title: title, description: group.dn}));
                  /* eslint-enable new-cap */
                }
                else {
                  oldRole++;
                  return saveDoc(_.assign(doc, {description: group.dn}));
                }
              });
            };

            // Create or update role for each AD group
            async.forEachOfSeries(results.groups, ProcessGroup, (err) => {
              if (err) {
                return done(err);
              }

              // Create or update user for each AD user
              async.forEachOfSeries(results.users, (user, index, next) => {
                var localRoles = [authenticatedRoleId];

                // Get user's group membership from AD and convert to role array
                ad.getGroupMembershipForUser({}, user.dn, function(err, groups) {
                  if (err) {
                    return next(err);
                  }

                  // Group may not already be seen depending on filter
                  async.forEachOfSeries(groups, ProcessGroup, (err) => {
                    if (err) {
                      return done(err);
                    }

                    _.each(groups, function(group) {
                      localRoles.push(globalRoles[group.sAMAccountName]);
                    });

                    // Can be used to test Mongoose errors
                    //const model = formio.resources.role.model;
                    const model = formio.resources.submission.model;
                    var name = user.sAMAccountName;

                    // What name to use?
                    if (!name) {
                      return next();
                    }

                    // Prepend domain so AD user can have same name as S9 user
                    name = `${domain}\\${name}`;

                    const query = {
                      form: {$in: [admForm, usrForm]},
                      'data.name': name,
                      deleted: {$eq: null}
                    };

                    // Look for user with same name as AD user
                    model.findOne(query, (err, doc) => {
                      if (err) {
                        return next(err);
                      }

                      // Do not create user with same name as Admin or update old Admin
                      if (doc && doc.form.toString() === admForm.toString()) {
                        return next();
                      }

                      // Do not update non-AD user who already has a password we've stored
                      if (doc && doc.data && doc.data.password) {
                        return next();
                      }

                      // Create new or update old user
                      const saveDoc = function(updatedDoc) {
                        updatedDoc.save((err, result) => {
                          if (err) {
                            return next(err);
                          }

                          next();
                        });
                      };

                      if (!doc) {
                        newUser++;
                        /* eslint-disable new-cap */
                        return saveDoc(new model({
                          form: usrForm,
                          data: {
                            dn: user.dn,
                            name: name,
                            email: user.mail || '',
                            domain: domain
                          },
                          roles: localRoles
                        }));
                        /* eslint-enable new-cap */
                      }
                      else {
                        oldUser++;
                        return saveDoc(_.assign(doc, {
                          data: {
                            dn: user.dn,
                            name: doc.data.name,
                            email: user.mail || '',
                            domain: doc.data.domain
                          },
                          roles: localRoles
                        }));
                      }
                    });
                  });
                });
              }, (err) => {
                if (err) {
                  return done(err);
                }

                done();
              });
            });
          });
        }
        catch (e) {
          done(e);
        }
      });
    });
  };

  function logAD(message) {
    /* eslint-disable no-console */
    console.log(message);
    /* eslint-enable no-console */
  }

  function ldeMessage(err) {
    err = err.lde_message;
    if (err.search(/: (Ref|Ldap|Name)Err: DSID-/) === 8) {
      const  part1 = 'Error synchronizing AD, please check that default.json file\'s ';
      const  part2 = 'ldap parameters are correct and that the AD server is up and running';
      return part1 + part2;
    }
    return err;
  }

  // Run AD synchronization periodically if period specified
  if (formio.config.ldap
  &&  formio.config.ldap.interval
  &&  typeof formio.config.ldap.interval === 'number') {
    setInterval(function() {
      logAD('Performing periodic AD synchronization');
      synchronize('', (err) => {
        if (err !== syncError) {
          synchronizing = false;
        }
        if (err) {
          // AD errors
          if (err.lde_message) {
            err = ldeMessage(err);
          }
          // Mongoose errors
          if (err.message) {
            err = err.message;
          }
          logAD(err);
          return;
        }

        logAD(`Added ${newRole} groups and ${newUser} users, updated ${oldRole} groups and ${oldUser} users`);
      });
    }, formio.config.ldap.interval * 60 * 1000);
  }

  // Implement a synchronize AD endpoint.
  if (router.post) {
    router.post('/adsync', (req, res, next) => {
      req.setTimeout(0);
      synchronize('', (err) => {
        if (err !== syncError) {
          synchronizing = false;
        }
        if (err) {
          // AD errors
          if (err.lde_message) {
            err = ldeMessage(err);
          }
          // Mongoose errors
          if (err.message) {
            err = err.message;
          }
          return res.headersSent ? next() : res.status(500).send(err);
        }

        return res.status(200).send(
          `Added ${newRole} groups and ${newUser} users, updated ${oldRole} groups and ${oldUser} users`);
      });
    });
  }

  // Implement a synchronize AD endpoint for a single user and their groups.
  if (router.post) {
    router.post('/adsync/user/:user', (req, res, next) => {
      req.setTimeout(0);
      synchronize(`(&(objectCategory=person)(samaccountname=${req.params.user}))`, (err) => {
        if (err !== syncError) {
          synchronizing = false;
        }
        if (err) {
          // AD errors
          if (err.lde_message) {
            err = ldeMessage(err);
          }
          // Mongoose errors
          if (err.message) {
            err = err.message;
          }
          return res.headersSent ? next() : res.status(500).send(err);
        }

        return res.status(200).send(
          `Added ${newRole} groups and ${newUser} users, updated ${oldRole} groups and ${oldUser} users`);
      });
    });
  }

  return {
    syncronize: synchronize
  };
};
