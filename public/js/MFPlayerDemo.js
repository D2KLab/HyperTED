var uri = videoURI.replace(new RegExp('&amp;', 'g'), '&');

$(document).ready(function () {
    var mfuri = uri; //Media Fragment URI
    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        ontimeready: highlight
    });


    $("#mfDiv").appendTo($(".mejs-controls"));

    function highlight() {
        var player_width = $(".mejs-time-total").width(); //total width of timeline
        var player_height = $(".mejs-time-total").height();

        var $highligthedMF = $('#mfDiv');
        if ($highligthedMF.length == 0) {
            $highligthedMF = $("<div>").attr('id', 'mfDiv');
            $highligthedMF.height(player_height);
        }

        var totDuration = $player.getDuration();
        var timeUnit = player_width / totDuration;

        var parsedJSON = $player.getMFJson();

        if (arguments.length == 2) {
            MEstart = arguments[0];
            MEend = arguments[1];
        } else {
            var MEt = parsedJSON.hash.t || parsedJSON.query.t;
            if (typeof MEt != 'undefined') {
                var MEstart = MEt[0].startNormalized * 1000; //media frame starting point in milliseconds
                var MEend = MEt[0].endNormalized * 1000; //media frame ending point in milliseconds

                MEend = (MEend > 0) ? MEend : totDuration;

            }
        }

        if (MEstart && MEend) {
            $highligthedMF.css("left", $(".mejs-playpause-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * timeUnit) + 5);
            $highligthedMF.width(Math.ceil((MEend - MEstart) * timeUnit)); //width of Media Frame Highlighting
            $highligthedMF.appendTo($(".mejs-controls")).show();
        }
    }

    retrieveInfo(uri, function (video_info) {
        $('#video-title').text(video_info.title);

        var $videoInfo = $('#video-info');

        var $rightCol = $('<div>').addClass('right-col');
        var $leftCol = $('<div>').addClass('left-col');
        $leftCol.append(statDiv('Published', video_info.published));
        $leftCol.append(statDiv('Category', video_info.category));
        $rightCol.append(statDiv('Views', video_info.views, 'eye-open'));
        $rightCol.append(statDiv('Likes', video_info.likes, 'thumbs-up'));
        $rightCol.append(statDiv('Favourites', video_info.favourites, 'star'));
        $rightCol.append(statDiv('AVG Rating', video_info.avgRate, 'signal'));

        $videoInfo.append($('<div>').addClass('stats-cont').append($leftCol).append($rightCol));

        var $tabCont;
        if (video_info.descr && video_info.sub) {
            var $tabNav = $('<ul>').addClass('nav nav-tabs').appendTo($videoInfo);
            $tabNav.append($('<li>').addClass('active').append($('<a href="#descr-cont">').attr('data-toggle', 'tab').text('Description')));
            $tabNav.append($('<li>').append($('<a href="#sub-cont">').attr('data-toggle', 'tab').text('Subtitles')));

            $tabCont = $('<div>').addClass('tab-content').appendTo($videoInfo);
        }
        if (video_info.descr) {

            var $descCont = $('<div>').addClass('desc-cont').attr('id', 'descr-cont');

            var $videoDesc = ($('<p>').html(video_info.descr).addClass('descr'));
            var $buttonNerd = ($('<button type="submit">').html('Nerdify').addClass('btn btn-danger btn-lg'));
            var $hiddenInput = ($('<input type="hidden" name="text">').val(video_info.descr.replace(new RegExp('<br />', 'g'), '\n')));
            var $hiddenInput2 = ($('<input type="hidden" name="type">').val("text"));
            var $hiddenInput3 = ($('<input type="hidden" name="videoid">').val(video_info.video_id));
            var $hiddenInput4 = ($('<input type="hidden" name="vendor">').val(video_info.vendor));
            var $buttonCont = $('<form>').attr('method', 'GET').attr('action', './nerdify').addClass('button-cont');
            $buttonCont.append($hiddenInput2).append($hiddenInput).append($hiddenInput3).append($hiddenInput4).append($buttonNerd);
            $descCont.append($videoDesc).append($buttonCont);

            if ($tabCont) {
                $descCont.addClass('tab-pane').appendTo($tabCont);
            } else {
                $videoInfo.append($descCont);
            }
        }
        if (video_info.sub) {
            var strList = video_info.sub.split('\n\n');
            var formattedSub = '';

            for (var sub in strList) {
                formattedSub += '<div>';
                var timeLine = true;
                var idLine = true;

                var lines = strList[sub].split('\n');
                lineLoop: for (var line in lines) {
                    if (idLine) {
                        //nothing for now
                        idLine = false;
                        continue lineLoop;
                    }
                    if (timeLine) {
                        //nothing for now
                        timeLine = false;
                        continue lineLoop;
                    }
                    formattedSub += '<p>' + lines[line] + '</p>';
                }
                formattedSub += '</div>';
            }

            var $buttonNerdSub = $('<button type="submit">').html('Nerdify Sub').addClass('btn btn-danger btn-lg');
            var $hiddenInputSub = $('<input type="hidden" name="text">').val(video_info.sub);
            var $hiddenInputSub2 = $('<input type="hidden" name="type">').val('timedtext');
            var $hiddenInputSub3 = ($('<input type="hidden" name="videoid">').val(video_info.video_id));
            var $hiddenInputSub4 = ($('<input type="hidden" name="vendor">').val(video_info.vendor));

            var $buttonContSub = $('<form>').attr('method', 'GET').attr('action', './nerdify').addClass('button-cont');
            $buttonContSub.append($hiddenInputSub2).append($hiddenInputSub).append($hiddenInputSub3).append($hiddenInputSub4).append($buttonNerdSub);
            var $subText = $('<div>').addClass('sub-text').html(formattedSub);
//            var $subText = $('<div>').addClass('sub-text').html(formattedSub);
            var $subCont = $('<div>').attr('id', 'sub-cont').append($buttonContSub).append($subText);
            if ($tabCont) {
                $subCont.addClass('tab-pane').appendTo($tabCont);
            } else {
                $videoInfo.append($descCont);
            }


            $buttonContSub.submit(function (e) {
                e.preventDefault();
                var $form = $(this);
                $('button[type="submit"]', $form).prop('disabled', true).addLoader('left');
                $form.ajaxSubmit({
                    dataType: 'json',
                    success: function (entityList) {

                        var strList = video_info.sub.split('\n\n');
                        var formattedSub = '';

                        for (var sub in strList) {
                            var timeLine = true;
                            var idLine = true;

                            var lines = strList[sub].split('\n');
                            lineLoop: for (var line in lines) {
                                if (idLine) {
                                    //nothing for now
                                    idLine = false;
                                    continue lineLoop;
                                }
                                if (timeLine) {
                                    //nothing for now
                                    timeLine = false;
                                    continue lineLoop;
                                }
                                formattedSub += lines[line] + ' ';
                            }
                        }

                        //sorting JSON for Start character desc
                        entityList.sort(function SortByStartChar(x, y) {
                            return ((x.startChar == y.startChar) ? 0 : ((x.startChar > y.startChar) ? -1 : 1 ));
                        });

                        var new_subs = formattedSub;
                        var oldstart;

                        $.each(entityList, function (key, value) {
                            var entity = value;
                            if (entity.endChar >= oldstart) {
                                // FIXME nested entities
                                // do not care for now
                                return;
                            }
                            var s1 = new_subs.substring(0, entity.startChar);
                            var s2 = new_subs.substring(entity.startChar, entity.endChar);
                            var s3 = new_subs.substring(entity.endChar);
                            var href = entity.uri ? 'href="' + entity.uri + '" target="_blank"' : '';
                            var nerdType = entity.nerdType.split('#')[1].toLowerCase();

                            new_subs = s1 + '<span class="entity ' + nerdType + '"><a href="#" +  data-start-time="' + entity.startNPT + '" data-end-time="' + entity.endNPT + '">' + s2 + '</a></span>' + s3;
                            entity.html = '<span class="entity ' + nerdType + '"><a ' + href + '> #' + s2 + '</a></span>';


                            oldstart = entity.startChar;
                        });

                        $('.sub-text', $subCont).html(new_subs);
                        $form.remove();
                        $subCont.html(new_subs);

                        $('#entity-sect').show();

                        entityList.sort(function SortByNerdType(x, y) {
                            return ((x.nerdType == y.nerdType) ? 0 : ((x.nerdType > y.nerdType) ? 1 : -1 ));
                        });


                        var $entityCont = $('.entity-content').html("<p>In this video there are " + entityList.length + " entities</p>");

                        var typeEntities = [];
                        for (var key in entityList) {

                            var actualEntity = entityList[key];
                            if (key == 0 || actualEntity.nerdType == entityList[key - 1].nerdType) {
                                typeEntities.push(actualEntity);
                            } else {
                                printEntityGroup(typeEntities);
                                typeEntities = [];
                                typeEntities.push(actualEntity);

                            }
                        }
                        printEntityGroup(typeEntities);

                        function printEntityGroup(array) {

                            var $typeEntity = $('<h3>').addClass('title').html(array.length + " " + array[0].nerdType.split('#')[1]);
                            var $entityList = $('<ul>').addClass('displayEntity');

                            for (var n in array) {
                                var $entity = $('<li>').html(array[n].html);
                                $entityList.append($entity);
                            }
                            $entityCont.append($typeEntity).append($entityList);
                            console.log($entityList);
                        }





                        $("span.entity").click(function () {
                            var startEntity = $(this).children('a').data('start-time') * 1000;
                            var endEntity = $(this).children('a').data('end-time') * 1000;

                            $player.setPosition(startEntity);
                            $player.play();
                            highlight(startEntity, endEntity);
                            var waitFragEndListener = function (event) {
                                console.log($player.getPosition());
                                if (endEntity != null && $player.getPosition() >= endEntity) {
                                    $player.pause();
                                    $player.getMeplayer().media.removeEventListener(waitFragEndListener);
                                    endEntity = null;
                                }
                            };

                            $player.getMeplayer().media.addEventListener('timeupdate', waitFragEndListener, false);
                        });


                        //TODO reformatted subs
                    },
                    error: function () {
                        console.error('Something went wrong');
                    }
                });
            });
        }


        if ($tabCont) {
            $tabCont.children('.tab-pane').first().addClass('active');
        }

        $buttonCont.submit(function (e) {
            e.preventDefault();
            var $form = $(this);
            $('button[type="submit"]', $form).prop('disabled', true).addLoader('left');
            $form.ajaxSubmit({
                dataType: 'json',
                success: function (responseText) {
                    //sorting JSON for Start character desc
                    responseText.sort(function SortByStartChar(x, y) {
                        return ((x.startChar == y.startChar) ? 0 : ((x.startChar > y.startChar) ? -1 : 1 ));
                    });

                    var new_descr = video_info.descr;
                    var oldstart;
                    $.each(responseText, function (key, value) {
                        var entity = value;
                        if (entity.endChar >= oldstart) {
                            // FIXME nested entities
                            // do not care for now
                            return;
                        }

                        var s1 = new_descr.substring(0, entity.startChar);
                        var s2 = new_descr.substring(entity.startChar, entity.endChar);
                        var s3 = new_descr.substring(entity.endChar);

                        new_descr = s1 + '<span class="entity ' + entity.nerdType.split('#')[1].toLowerCase() + '"><a href="' + entity.uri + '">' + s2 + '</a></span>' + s3;
                        oldstart = entity.startChar;
                    });
                    $('.descr', $descCont).html(new_descr);
                    $form.remove();
                },
                error: function () {
                    console.error('Something went wrong');
                }
            });
        });

    }, true);


    $('.video-list .video-link').each(function () {
        var $li = $(this);
        var video_url = $li.data('url');
        if (typeof video_url != 'undefined' && video_url != "") {

            retrieveInfo(video_url, function (video_info) {
                $('h4 a', $li).text(video_info.title).attr('alt', video_info.title);
                var $thumb = $('<img>').attr('src', video_info.thumb).addClass('thumb');
                $('.thumb-cont', $li).attr('title', video_info.title).append($thumb);

                $('.loader', $li).hide();
                $('.content', $li).show(function () {
                    $(this).addClass('visible');
                });
            });

            $('.frag-link a', $li).click(function () {
                var frag_param = $(this).data('frag') || "";
                var complete_url = video_url + frag_param;

                var $form = $('#video-search');
                $('input[name=uri]').val(complete_url);
                $form.submit();
            });
        }
    });

    function statDiv(key, value, glyph) {
        if (value == undefined || value == null) return null;

        var $stat = $('<div>').addClass('stat');

        if (glyph) {
            $stat.append($('<span>').addClass('key glyphicon glyphicon-' + glyph).attr('title', key));
            $stat.addClass('little');
        } else {
            $stat.append($('<label>').addClass('key').text(key));
        }
        $stat.append($('<span>').addClass('value').text(value));

        return $stat;
    }

    function retrieveInfo(uri, callback, full) {
        var video_info = {};
        if (smfplayer.utils.isYouTubeURL(uri)) {
            video_info.video_id = uri.match(/v=(.{11})/)[1];
            video_info.vendor = 'youtube';
            var retriveSub = function () {
                return;
            }
            if (full) {
                retriveSub = $.get;
            }

            $.when(
                $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + video_info.video_id + '?v=2&alt=json-in-script&callback=?', function (data) {
                    video_info.title = data.entry.title.$t;
                    video_info.thumb = data.entry.media$group.media$thumbnail[0].url;
                    video_info.descr = data.entry.media$group.media$description.$t.replace(new RegExp('<br />', 'g'), '\n');
                    video_info.views = data.entry.yt$statistics.viewCount;
                    video_info.favourites = data.entry.yt$statistics.favoriteCount;
                    video_info.comments = data.entry.gd$comments.gd$feedLink.countHint;
                    video_info.likes = data.entry.yt$rating.numLikes;
                    video_info.avgRate = data.entry.gd$rating.average;
                    video_info.published = data.entry.published.$t;
                    video_info.category = data.entry.category[1].term;
                }),
                retriveSub('./srt?video_id=' + video_info.video_id + '&vendor=youtube', function (data) {
                    video_info.sub = data;
                })
            ).then(function () {
                    callback(video_info);
                }, function () {
                    callback(video_info);
                });
        } else if (smfplayer.utils.isDailyMotionURL(uri)) {
            video_info.video_id = uri.match(/video\/([^_||^#]+)/)[1];
            video_info.vendor = 'dailymotion';

            var retrieveSub = function () {
                return;
            }
            if (full) {
                retrieveSub = $.get;
            }

            $.when(
                $.getJSON('https://api.dailymotion.com/video/' + video_info.video_id + '?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre&callback=?', function (data) {
                    video_info.title = data.title;
                    video_info.thumb = data.thumbnail_60_url;
                    video_info.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                    video_info.views = data.views_total;
                    video_info.favourites = data.bookmarks_total;
                    video_info.comments = data.comments_total;
                    video_info.likes = data.ratings_total;
                    video_info.avgRate = data.rating;
                    video_info.published = data.created_time;
                    video_info.category = data.genre;
                }),
                retrieveSub('./srt?video_id=' + video_info.video_id + '&vendor=dailymotion', function (data) {
                    video_info.sub = data;
                })
            ).then(function () {
                    callback(video_info);
                }, function () {
                    callback(video_info);
                });
        }
        //TODO other video platforms
    }

});


jQuery.fn.extend({
    addLoader: function (direction) {
        if (!jQuery.loaderImg) {
            jQuery.loaderImg = $("<img>").attr('src', 'img/ajax-loader.gif');
        }

        $loaderImg = jQuery.loaderImg;
        jQuery.loaderImg = $loaderImg.clone();
        if (direction == 'left') {
            $(this).before($loaderImg);
        } else {
            $(this).after($loaderImg);
        }
        return true;
    }
});
