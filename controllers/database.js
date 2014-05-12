var fs = require("fs"),
    sqlite3 = require("sqlite3"),
    UUID = require("node-uuid");
var db;


exports.prepare = function () {
    var file = 'database/video.db';

    var exists = fs.existsSync(file);
    if (!exists) {
        console.log("Creating DB file.");
        fs.openSync(file, "w")
    }

    sqlite3.verbose();
    db = new sqlite3.Database(file);
    db.serialize(function () {
        if (!exists) {
            db.run('CREATE TABLE "videos" ("id" STRING PRIMARY KEY NOT NULL, "locator" STRING NOT NULL UNIQUE)');
        }
    });

};

exports.getLocator = function (uuid, callback) {
    var select = "SELECT locator FROM videos WHERE id == ?";
    db.get(select, uuid, callback);
};

exports.insert = function (locator, callback) {
    var uuid = UUID.v4();
    var insert = "INSERT INTO videos (id, locator) VALUES ($uuid, $locator)";
    db.run(insert, {
        $uuid: uuid,
        $locator: locator
    }, function(err){
        if(err){
            console.log('DB insert fail. '+JSON.stringify(err));
            console.log('Check for existent locator.');
            var selectByLoc = "SELECT id FROM videos WHERE locator == ?";
            db.get(selectByLoc, locator, callback);
        }else{
            var data = {
              id: uuid
            };
            callback(false, data);
        }

    });
};