var http = require('http'),
    xml2js = require('xml2js');
function getYouTubeSub(video_id, callback) {
    if (video_id == null || video_id == '') {
        console.error("Empty video id");
        callback(true, "Empty video id");
        return;
    }
    console.log("http://www.youtube.com/api/timedtext?lang=en&v=" + video_id);
    http.get("http://www.youtube.com/api/timedtext?lang=en&format=srt&v=" + video_id, function (res) {
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
            } else
                callback(false, data);

        });
    });

}

exports.getYouTubeSub = getYouTubeSub;