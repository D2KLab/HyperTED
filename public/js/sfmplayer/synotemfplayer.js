/* eslint-env browser */
/* global jQuery MediaFragments */

(function sfm($) {
  const VERBOSE = false;
  // more options can be found at http://mediaelementjs.com/#api
  const defaults = {
    width: 640, // the width in pixel of the video on the webpage, no matter if it's audio or video
    height: 480, // the height in pixel of the video on the webpage, no matter if it's audio or video
    originalWidth: 320, // the original width in pixel of the video, used for spatial fragment
    originalHeight: 240, // the original height in pixel of the video, used for spatial fragment
    isVideo: true, // is the URI indicating a video or audio
    mfAlwaysEnabled: false, // the media fragment is always enabled, i.e. you can only play the media fragment
    spatialEnabled: true, // spatial dimension of the media fragment is enabled
    spatialStyle: {}, // a json object to specify the style of the outline of the spatial area
    spatialOverlay: false, // spatial fragment overflow is not partially overshadow as default
    temporalHighlight: false, // temporal fragments are not highlighted as default
    autoStart: true, // auto start playing after initialising the player
    // xywhoverlay: jquery object of a div to identify xywh area
    tracks: [], // a JSON array like {srclang:"en", kind:"subtitles", type:"text/vtt", src:"somefile.vtt"} or {srclang:"zh", kind:"chapter", type:"text/plain", src:"somefile.srt"}
  };

  function startFragment(self) {
    const data = $(self).data('smfplayer');

    const lazyObj = getMfjsonLazy(data.mfjson);
    self.setPosition(lazyObj.st * 1000);
    if (!$.isEmptyObject(lazyObj.xywh) && data.settings.spatialEnabled) self.showxywh(lazyObj.xywh);
  }


  const methods = {
    init(options) {
      const self = this; // save the instance of current smfplayer object

      /* ----------Declare public functions---------------------*/
      this.pause = function pause() {
        if (VERBOSE) console.log('pause');

        const player = $(this).data('smfplayer').smfplayer;
        if (player) player.pause();
        else console.error("smfplayer hasn't been initalised");
      };

      this.play = function play() {
        // console.log($(this));

        if (VERBOSE) console.log('play');

        const player = $(this).data('smfplayer').smfplayer;
        if (player) player.play();
        else console.error("smfplayer hasn't been initalised");
      };

      this.playmf = function playmf() {
        const data = $(this).data('smfplayer');
        if (!data) {
          setTimeout(self.playmf, 100);
          return;
        }
        let st = 0;
        let et = -1;
        if (!$.isEmptyObject(data.mfjson.hash)) {
          const tObj = smfplayer.utils.getTemporalMF(data.mfjson.hash.t[0]);
          st = tObj.st;
          et = tObj.et;
        }

        const player = $(this).data('smfplayer').smfplayer;
        // console.log(player);

        this.setPosition(st * 1000);

        if (player.media.paused) player.play();

        data.mfreplay = true;
      };

      this.showxywh = function showxywh(xywh) {
        if (VERBOSE) console.log('showxywh');
        const data = $(this).data('smfplayer');

        //* ********check data.xywhoverlay!!!*********

        if (!data) {
          setTimeout(() => self.showxywh(xywh), 100);
          return;
        }

        if ($.isEmptyObject(xywh) || !data.settings.spatialEnabled) return;

        let spatialDiv;
        let overlayContainer;
        if (!data.settings.xywhoverlay) {
          // the overlay hasn't been created
          this.addClass('smfplayer-container');
          const mejsCont = this.find('.mejs-container');

          overlayContainer = $('<div>').addClass('overlay-container');
          overlayContainer
            .height(data.settings.height)
            .width(data.settings.width)
            .appendTo(mejsCont);
          spatialDiv = $('<div/>')
            .css(data.settings.spatialStyle)
            .addClass('smfplayer-overlay')
            .appendTo(overlayContainer);

          if (data.settings.spatialOverlay) {
            const $topdiv = $('<div>').addClass('smfplayer-overlay-dark');
            const $leftdiv = $topdiv.clone();
            const $rightdiv = $topdiv.clone();
            const $bottomdiv = $topdiv.clone();

            $topdiv.css({
              top: 0,
              left: 0,
              height: xywh.y,
              width: '100%',
            });

            $leftdiv.css({
              top: `${xywh.y}px`,
              left: 0,
              height: xywh.h,
              width: xywh.x,
            });

            $rightdiv.css({
              top: `${xywh.y}px`,
              right: 0,
              height: xywh.h,
              width: (data.settings.width) - (parseInt(xywh.x) + parseInt(xywh.w)),
            });

            $bottomdiv.css({
              bottom: 0,
              left: 0,
              height: (data.settings.height) - (parseInt(xywh.y) + parseInt(xywh.h)),
              width: '100%',
            });
            overlayContainer.append($topdiv, $leftdiv, $rightdiv, $bottomdiv);
            spatialDiv = spatialDiv.add(overlayContainer);
          }

          const superThis = this;
          spatialDiv.click(() => {
            const player = superThis.getMeplayer();
            if (player.media.paused) player.play();
            else player.pause();
          });
          data.settings.xywhoverlay = spatialDiv;
        } else {
          spatialDiv = data.settings.xywhoverlay;
        }

        // console.log(xywh);

        const { unit } = xywh;
        let {
          x, y, w, h,
        } = xywh;

        // unit is 'pixel' or 'percent'
        if (unit === 'percent') {
          // var wratio = data.settings.width/data.settings.originalWidth;
          // var hratio = data.settings.height/data.settings.originalHeight;

          x = Math.floor((x / 100) * data.settings.width);
          w = Math.floor((w / 100) * data.settings.width);
          y = Math.floor((y / 100) * data.settings.height);
          h = Math.floor((h / 100) * data.settings.height);
        }

        spatialDiv.filter('.smfplayer-overlay').css({
          width: w, height: h, top: `${y}px`, left: `${x}px`,
        });
        spatialDiv.show();
      };

      this.highlight = function highlight() {
        const duration = self.getDuration();
        // if no data, retry in 500ms
        if (!duration) return setTimeout(self.highlight, 500);

        const $timelineContainer = $('.mejs-time-total', self);
        let $highligthedMF = $('.mfHighlight', $timelineContainer);

        if (!$highligthedMF.exists()) {
          $highligthedMF = $('<span>').addClass('mfHighlight');
        }

        const MEt = self.getMFJson().hash.t || self.getMFJson().query.t;
        if (MEt) {
          // media frame starting point in milliseconds
          const startMS = MEt[0].startNormalized * 1000;
          // media frame ending point in milliseconds
          let endMS = MEt[0].endNormalized * 1000;
          endMS = (endMS > 0) ? endMS : duration;

          $highligthedMF.css('left', `${(startMS * 100) / duration}%`)
            .width(`${((endMS - startMS) * 100) / duration}%`)
            .appendTo($timelineContainer).show();
        }
        return this;
      };

      this.hidexywh = function hidexywh() {
        if (VERBOSE) console.log('hidexywh');

        const data = $(this).data('smfplayer');
        if (!data) {
          setTimeout(self.hidexywh, 100);
          return;
        }

        if (data.settings.xywhoverlay) data.settings.xywhoverlay.hide();
      };

      this.load = function load() {
        if (VERBOSE) console.log('load');

        const player = $(this).data('smfplayer').smfplayer;
        if (player) player.load();
        else console.error("smfplayer hasn't been initalised");
      };

      this.getPosition = function getPosition() {
        // get position in milliseconds
        const player = $(this).data('smfplayer').smfplayer;
        if (player) return parseInt(player.getCurrentTime() * 1000);

        console.error("smfplayer hasn't been initalised");
        return -1;
      };

      this.setPosition = function setPosition(position = 0) {
        // set position in milliseconds
        const player = $(this).data('smfplayer').smfplayer;

        if (!player) { console.error("smfplayer hasn't been initalised"); return; }
        if (self.getPosition() <= 0) setTimeout(() => self.setPosition(position), 100);
        else player.setCurrentTime(position / 1000);
      };

      this.getDuration = function getDuration() { // in milliseconds
        const player = $(this).data('smfplayer').smfplayer;
        if (player) return player.media.duration * 1000;

        console.error("smfplayer hasn't been initalised");
        return -1;
      };

      this.getMFJson = function getMFJson() {
        return $(this).data('smfplayer').mfjson;
      };

      this.setmf = function setmf(frag) {
        frag = !frag.includes('#') ? `#${frag}` : frag;
        window.frag = frag;
        const newProp = MediaFragments.parse(frag);
        $.extend($(this).data('smfplayer').mfjson, newProp);

        const data = $(this).data('smfplayer');
        if (data.settings.temporalHighlight) {
          $(self.getMeplayer().media).one('timeupdate', self.highlight);
        }
        return this;
      };

      // get the original mejs player
      this.getMeplayer = function getMeplayer() {
        return $(this).data('smfplayer').smfplayer;
      };

      // get the setting options
      this.getOptions = function getOptions() {
        return $(this).data('smfplayer').settings;
      };

      // get the video/audio dom object
      this.getDomObject = function getDomObject() {
        return $(this).data('smfplayer').smfplayer.domNode;
      };

      /* -----------Public attributes declaration ends----------------*/

      // console.log("before each");
      // console.log(this);
      return this.each((_i, el) => {
        const $this = $(el);
        const data = $this.data('smfplayer');

        // console.log("each");
        // console.log(data);

        // If the plugin hasn't been initialized yet
        if (!data) {
          if (VERBOSE) console.log('init smfplayer data');

          const settings = $.extend({}, defaults, options);
          if (!settings.mfURI) {
            console.error('mfURI cannot be null!');
            return false;
          }

          // parse media fragment
          const mfjson = MediaFragments.parseMediaFragmentsUri(settings.mfURI);
          // if(VERBOSE)
          //      console.log(mfjson);


          settings.success = function onsuccess(mediaElement, domObject, p) {
            if (VERBOSE) console.log('smfplayer init success.');

            let dat = $(self).data('smfplayer');

            if (settings.autoStart) {
              if (mediaElement.pluginType === 'flash') {
                mediaElement.addEventListener('canplay', () => {
                  if (VERBOSE) console.log('canplay');
                  mediaElement.play();

                  dat = $(self).data('smfplayer');

                  if (!dat) setTimeout(() => startFragment(self), 100);
                  else startFragment(self);
                }, false);
              } else {
                mediaElement.play();

                if (!dat) setTimeout(() => startFragment(self), 100);
                else startFragment(self);
              }
            }


            mediaElement.addEventListener('timeupdate', () => {
              const { currentTime } = mediaElement;
              const data = $(self).data('smfplayer');

              if (!data) return;

              const lazyObj = getMfjsonLazy(data.mfjson);
              const { st } = lazyObj;
              const { et } = lazyObj;
              const { xywh } = lazyObj;

              // console.log("ct:"+currentTime);
              if (currentTime < et && currentTime > st) {
                if (!$.isEmptyObject(xywh) && data.settings.spatialEnabled) {
                  if (!data.settings.xywhoverlay || !data.settings.xywhoverlay.is(':visible')) {
                    self.showxywh(xywh);
                  }
                }
                if (data.setPositionLock) data.setPositionLock = false;
              } else {
                if (data.settings.xywhoverlay && data.settings.xywhoverlay.is(':visible')) {
                  self.hidexywh();
                }

                if (data.mfreplay || settings.mfAlwaysEnabled) {
                  if (currentTime > et) {
                    mediaElement.pause();
                    self.setPosition(et * 1000);
                    data.mfreplay = false;
                  } else if (currentTime < st) {
                    if (!data.setPositionLock) {
                      // console.log("false:"+currentTime);
                      self.setPosition(st * 1000);
                      data.setPositionLock = true;
                    }
                  }
                }
              }
            }, false);

            if (settings.temporalHighlight) {
              $(mediaElement).one('timeupdate', self.highlight);
            }

            mediaElement.addEventListener('play', () => {
              const { currentTime } = mediaElement;
              const data = $(self).data('smfplayer');

              if (!data) return;

              const lazyObj = getMfjsonLazy(data.mfjson);
              const { st } = lazyObj;
              const { et } = lazyObj;

              if (data.mfreplay) {
                // console.log("mfreplay:"+currentTime); //add a flag as autostart finished
                if (currentTime < st) {
                  // console.log("setposition:"+st+"::"+setPositionLock);
                  if (!data.setPositionLock) {
                    self.setPosition(st * 1000);
                    data.setPositionLock = true;
                  }
                } else if (currentTime > et) {
                  // console.log("no:"+et+"::"+setPositionLock);
                  if (!data.setPositionLock) {
                    self.setPosition(et * 1000);
                    data.setPositionLock = true;
                    mediaElement.pause();
                    data.mfreplay = false;
                  }
                }
              }
            }, false);


            if (options.success) {
              return options.success.call(this, mediaElement, domObject);
            }
          };

          settings.error = function onerror() {
            if (options.error) options.error.call(this);
          };

          let videosrc = settings.mfURI;
          // remove the hash for the url
          if (!$.isEmptyObject(mfjson.hash)) {
            const indexOfHash = settings.mfURI.indexOf('#');
            videosrc = indexOfHash !== -1 ? settings.mfURI.substring(0, indexOfHash) : settings.mfURI;
          }

          if (VERBOSE) console.log(videosrc);

          const mm = settings.isVideo ? $('<video/>') : $('<audio/>');
          mm.prop('width', settings.width).prop('height', settings.height).prop('preload', 'auto').appendTo($this);
          const mmSource = $('<source/>').prop('src', videosrc).appendTo(mm);

          // Decide the type of the video or audio
          if (smfplayer.utils.isYouTubeURL(settings.mfURI)) {
            mmSource.prop('type', 'video/x-youtube');
          } else if (smfplayer.utils.isDailyMotionURL(settings.mfURI)) {
            mmSource.prop('type', 'video/dailymotion');
          } else if (smfplayer.utils.isVimeoURL(settings.mfURI)) {
            mmSource.prop('type', 'video/vimeo');
          } else {
            const jqURL = $.url(settings.mfURI);
            const file = jqURL.attr('file').toLowerCase();

            const parts = file.split('.');
            // if no file extension
            if (parts.length > 1) {
              const extension = parts[parts.length - 1].toLowerCase();
              if (extension) {
                if ($.inArray(extension, smfplayer.utils.videoList) !== -1) {
                  mmSource.attr('type', `video/${extension}`);
                } else if ($.inArray(extension, smfplayer.utils.audioList) !== -1) {
                  mmSource.prop('type', `audio/${extension}`);
                } else {
                  // do nothing
                }
              }
            }
          }

          // init tracks
          $.each(settings.tracks, (idx, trackObj) => {
            const track = $('<track/>').appendTo(mm);
            track.prop('srclang', trackObj.srclang).prop('kind', trackObj.kind).prop('type', trackObj.type).prop('src', trackObj.src);
          });


          // call mediaelemntjs
          const meplayer = new MediaElementPlayer(mm.get(0), settings);
          // console.log(meplayer);
          $this.data('smfplayer', {
            target: $this,
            smfplayer: meplayer,
            settings,
            mfjson,
            mfreplay: true, // replay the mf when the video starts, but the mf will only be replayed once
            setPositionLock: false, // sometimes the setPostion(position) will set a currentTime that around the actual 'position'. If this happens, the timeupdate event should not trigger setPosition again when the position > currentTime
          });
        }
      });
    },
    destroy() {
      return this.each((_i, el) => {
        const $this = $(el);

        $(window).unbind('.smfplayer');
        $this.removeData('smfplayer');
        $this.empty();
      });
    },
  };

  let getMfjsonLazy = function getMfjsonLazy(mfjson) {
    let st = 0;
    let et = smfplayer.utils.durationMax;

    if (!$.isEmptyObject(mfjson.hash.t)) { // currently, only support npt
      const tObj = smfplayer.utils.getTemporalMF(mfjson.hash.t[0]);
      st = tObj.st;
      et = tObj.et;
    }

    const xywh = (mfjson.hash.xywh && mfjson.hash.xywh[0]) || {};

    return { st, et, xywh };
  };

  $.fn.smfplayer = function smfplayer(method) {
    if (methods[method]) {
      return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
    } if (typeof method === 'object' || !method) {
      return methods.init.apply(this, arguments);
    }
    $.error(`Method ${method} does not exist on jQuery.smfplayer`);
  };
}(jQuery));
