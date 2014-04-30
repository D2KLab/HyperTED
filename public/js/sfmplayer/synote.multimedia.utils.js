smfplayer.utils={
	durationMax: 4294967295,
	audioList:new Array('wma','m4a','mp3','wav','mpeg'),
	videoList:new Array('mp4','m4v','mov','wmv','flv','ogg','webm'),
	isYouTubeURL:function(url,bool) {
	
	    var pattern = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?=.*v=((\w|-){11}))(?:\S+)?$/;
	    if (url.match(pattern)) {
	        return (bool !== true) ? RegExp.$1 : true;
	    } else { return false; }
	},
	isDailyMotionURL:function(url,bool) 
	{
		var m = url.match(/^.+dailymotion.com\/(video|hub)\/([^_]+)[^#]*(#video=([^_&]+))?/);
	    return m !== null;
	},
	isVimeoURL:function(url,bool)
	{
		var m = url.match(/^.+vimeo.com\/(\d+)?/);
	    return m !== null;

	},
	isValidURL:function(str) {
	
		var pattern = /^(([\w]+:)?\/\/)?(([\d\w]|%[a-fA-f\d]{2,2})+(:([\d\w]|%[a-fA-f\d]{2,2})+)?@)?([\d\w][-\d\w]{0,253}[\d\w]\.)+[\w]{2,4}(:[\d]+)?(\/([-+_~.\d\w]|%[a-fA-f\d]{2,2})*)*(\?(&?([-+_~.\d\w]|%[a-fA-f\d]{2,2})=?)*)?(#([-+_~.\d\w]|%[a-fA-f\d]{2,2})*)?$/;
			return pattern.test(str);
		
	},
	isiPad:function(){
        return (navigator.userAgent.match(/iPad/i) != null);
	},
	
	getTemporalMF:function(t)
	{
		var st = t.start?t.startNormalized:0;	
       	var et = t.end?t.endNormalized:this.durationMax; //-1 means no end time is provided
       	st = parseFloat(st);//in seconds
       	et = parseFloat(et);//in seconds
       	var tObj = {st:st, et:et};
       	return tObj;
	},
	getSpatialMF:function(xywh)
	{
		
	}
}