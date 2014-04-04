/**
 * Created by Marella Sabatino on 04/04/2014.
 */
var uri = 'http://www.youtube.com/watch?v=LxHK5OSUXr0#t=5,9';

$(document).ready(function () {

    var mfuri = uri; //Media Fragment URI

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri
    });


    var parsedJSON = MediaFragments.parseMediaFragmentsUri(mfuri);
    //console.log(parsedJSON);
    $('#parsed').text(parsedJSON);


    setTimeout(function () {


        var $player_width = $(".mejs-time-total").width();
        var $player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("#mfDiv");
        $highligthedMF.height(2 * $player_height);
        $highligthedMF.width($player_width);

        setTimeout(function () {
            var $totDuration = $player.getDuration();
            var $timeUnit = $player_width / $totDuration;

            console.log($totDuration);
            console.log($timeUnit);
            //var $MEstart = MediaFragments.time

        }, 1000);




        //console.log($highligthedMF.getMeplayer());
        //console.log(mfuri.getDuration());


    }, 250);


});
