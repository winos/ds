var EventEmitter = require('events');
var util = require('util');


function LDAPPasswordVerifier(client, adminClient, dn) {
  EventEmitter.call(this);
  this._dn = dn;
  
  this._client = client;
  
  this._adminClient = adminClient;
  this._adminClient.on('connect', this.emit.bind(this, 'ready'));
  this._adminClient.on('error', this.emit.bind(this, 'error'));
}

util.inherits(LDAPPasswordVerifier, EventEmitter);

LDAPPasswordVerifier.prototype.verify = function(username, password, cb) {
  var self = this;
  this._find({ username: username }, function(err, user) {
    if (err) { return cb(err); }
    if (!user) { return cb(null, false); }
    
    self._client.bind(user.dn, password, function(err) {
      if (err && err.code == 49) { // invalidCredentials
        return cb(null, false);
      } else if (err) {
        return cb(err);
      }
      
      return cb(null, user);
    });
  });
};

LDAPPasswordVerifier.prototype._find = function(query, cb) {
  
  // TODO: Make this more extensible on object class
  // Normalize to portable contacts, like Passport.js
  function normalize(entry) {
    var entity = {};
    entity.id = entry.uidNumber;
    entity.dn = entry.dn;
    entity.username = entry.uid;
    entity.displayName = entry.cn;
    entity.name = {
      familyName: entry.sn,
      givenName: entry.givenName
    }
    
    if (entry.mail) {
      entity.emails = [ { value: entry.mail } ];
    }
    return entity;
  }
  
  
  var opts = { scope: 'one' };
  opts.filter = '(uid=' + query.username + ')';
  
  this._adminClient.search(this._dn, opts, function(err, res) {
    if (err) {
      return cb(err);
    }
    
    var entries = [];
    
    res.on('searchEntry', function(entry) {
      entries.push(entry.object);
    });
    
    res.on('searchReference', function(referral) {
    });
    
    res.on('end', function(result) {
      if (result.status != 0) {
        return cb(new Error('LDAP search error'));
      }
      
      switch (entries.length) {
      case 0:
        return cb(null);
      case 1:
        // TODO: Normalize this object
        return cb(null, normalize(entries[0]));
      default:
        return cb(new Error('LDAP search too many results'));
      }
    });
    
    res.on('error', function(err) {
      return cb(err);
    });
  });
};


module.exports = LDAPPasswordVerifier;
