var https = require('https');
var http = require('http');

function getDailymotionSub(video_id, callback) {
    if (video_id == null || video_id == '') {
        console.error("Empty video id");
        callback(true, "Empty video id");
        return;
    }
    https.get('https://api.dailymotion.com/video/' + video_id + '/subtitles?fields=id,language%2Curl', function (res) {
        console.log("Got res: " + res.statusCode);
        if (res.statusCode != 200) {
            callback(true, res.statusCode);
            return;
        }


        var data = '';
        res.on("data", function (chunk) {
            data += chunk;

        });
        res.on('end', function () {
            if (data == '') {
                callback(true, 'No sub available');
                return;
            }
            data = JSON.parse(data);
            if (data.total > 0) {
//                video_info.sub_id = data.list[0].id;
//                video_info.sub_language = data.list[0].language;
                var url = (data.list[0].url);
                http.get(url, function (res) {

                    console.log("Got res: " + res.statusCode);
                    if (res.statusCode != 200) {
                        callback(true, res.statusCode);
                        return;
                    }

                    var data = '';
                    res.on("data", function (chunk) {

                        data += chunk;
                        quote(data);

                    });
                    res.on('end', function () {
                        if (data == '') {
                            callback(true, 'No sub available');
                            return;
                        }
                        callback(false, data);
                    });
                });
            } else {
                //TODO
            }

        });

//from UTF-8 to ASCII encoding
        var escapable = /[\\\"\x00-\x1f\x7f-\uffff]/g,
            meta = {    // table of character substitutions
                '\b': '\\b',
                '\t': '\\t',
                '\n': '\\n',
                '\f': '\\f',
                '\r': '\\r',
                '"': '\\"',
                '\\': '\\\\'
            };

        function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

            escapable.lastIndex = 0;
            return escapable.test(string) ?
                '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === 'string' ? c :
                    '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
                '"' + string + '"';
        }

    });


}


exports.getDailymotionSub = getDailymotionSub;