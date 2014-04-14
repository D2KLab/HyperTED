var http = require('http'),
    xml2js = require('xml2js');
function getYouTubeSub(video_id, callback) {
    if(video_id == null || video_id == ''){
        console.error("Empty video id");
        callback(true, "Empty video id");
        return;
    }
    console.log("http://www.youtube.com/api/timedtext?lang=en&v="+video_id);
    http.get("http://www.youtube.com/api/timedtext?lang=en&v="+video_id, function (res) {
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
            if( data == ''){
                callback(true, 'No sub available');
                return;
            }
            ytXml2srt(data, function (err, result) {
                callback(err, result);
            });

        });
    });

}

function ytXml2srt(data, callback) {
    xml2js.parseString(data, function (err, json) {
        console.log(json);
        if (err) {
            callback(err, json);
        }else {
            var srt = '', n = 0;
            var captionsList = json.transcript.text;
            captionsList.forEach(function (cap) {
                n++;
                var text = cap._;
                var start = sec2timecode(cap.$.start);
                cap.$.end = parseFloat(cap.$.start) + parseFloat(cap.$.dur);
                var end = sec2timecode(cap.$.end);
                var string = n + '\n';
                string += start + ' --> ' + end + '\n';
                string += text + '\n\n';
                srt += string;
            });
            callback(err, srt);
        }
    });

}

function sec2timecode(origin) {
    var hh, mm, ss, ms;

    hh = Math.floor(origin / 60 / 60);
    origin -= hh * 60;
    hh = padZero(hh);

    mm = Math.floor(origin / 60);
    origin -= mm * 60;
    mm = padZero(mm);


    ss = Math.floor(origin);
    ms = Math.floor((origin - ss) * 1000);
    ss = padZero(ss);
    ms = padZero(ms, 3);

    return hh + ':' + mm + ':' + ss + ',' + ms;
}

function padZero(input, digit) {
    var output = '' + input;
    var d = digit || 2;
    while (output.length < d){
        output = '0' + output;
    }
    return output;
}

exports.getYouTubeSub = getYouTubeSub;