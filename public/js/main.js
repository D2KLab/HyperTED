/* eslint-env browser */
/* global $ jQuery video */
/* eslint-disable prefer-object-spread */


const videoUri = video.uri.replace(new RegExp('&amp;', 'g'), '&') + window.location.hash;
const storageKey = 'fragmentenricher.';
const videokey = `${storageKey + video.uuid}.`;
let $plainSubCont; // Container for subs with no entities
let $player;

const baseUri = '/Hyperted';

function setLocation(key, value) {
  // add or remove search parameters without reloading the page
  const searchParams = new URLSearchParams(window.location.search);

  if (value) searchParams.set(key, value);
  else searchParams.delete(key);

  let newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${searchParams.toString()}`;
  if (window.location.hash) newurl += `${window.location.hash}`;
  window.history.pushState({ path: newurl }, '', newurl);
}

function labelTime(time) {
  let hh = Math.floor(time / 3600);
  hh = hh < 10 ? `0${hh}` : hh;
  let mm = Math.floor((time % 3600) / 60);
  mm = mm < 10 ? `0${mm}` : mm;
  let ss = Math.floor((time % 3600) % 60);
  ss = ss < 10 ? `0${ss}` : ss;

  return `${hh}:${mm}:${ss}`;
}

function showTEDSuggestedChaps() {
  if (!$player) return;

  const $suggestedVideoList = $('#suggestedVideoList');
  const $playlistSect = $('.see-also #playlist-sect');

  const extractor = (new URLSearchParams(window.location.search)).enriched;
  $('.invite', $playlistSect).toggle(!extractor);
  $('.no_ent', $playlistSect).hide();

  if (extractor) {
    $('.loading', $playlistSect).show();
    const timeFrag = $player.getMFJson().hash.t;

    $.ajax({
      url: `/HyperTED/suggestmf/${video.uuid}`,
      data: {
        extractor,
        startMF: (timeFrag && timeFrag[0].startNormalized) || 0,
        endMF: (timeFrag && timeFrag[0].endNormalized) || null,
      },
    }).done((res) => {
      $('.loading', $playlistSect).hide();
      $suggestedVideoList.empty();
      $('.no_ent', $playlistSect).toggle(!Object.keys(res).length);

      for (const [uuid, suggVideo] of Object.entries(res)) {
        const meta = suggVideo.metadata;
        let title = 'Video';
        let thumb = `${baseUri}/img/thumb-default.png`;
        if (suggVideo.metadata) {
          title = meta.title;
          thumb = meta.thumb;
        }
        $suggestedVideoList.loadTemplate($('#suggTedChap'),
          {
            uuid,
            href: `${baseUri}/video/${uuid}`,
            title,
            thumb,
          },
          { append: true });

        const thisVid = $(`.video-link[data-uuid=${uuid}]`, $suggestedVideoList);
        const frags = suggVideo.chaps;
        for (const frag of frags) {
          $('.frag-list', thisVid).loadTemplate($('#fragLi'),
            {
              href: `${baseUri}/video/${uuid}#t=${frag.startNPT},${frag.endNPT}`,
              content: `Chapter ${frag.chapNum} (${labelTime(frag.startNPT)} - ${labelTime(frag.endNPT)})`,
            },
            { append: true });
        }
      }
      let raccFor = 'the entire video';
      const tFrag = $player.getMFJson().hash.t;
      if (tFrag) {
        raccFor = $('.selected-chap-num').text();
        raccFor = raccFor.trim().length ? `chapter ${raccFor}` : `t=${tFrag[0].start},${tFrag[0].end}`;
      }
      $suggestedVideoList.prepend($(`<h4>Raccomandation for ${raccFor}</h4>`));
    }).fail(() => {
      $('.loading', $playlistSect).hide();
      $('.see-also').html('<p>Something went wrong, please try later</p>');
    });
  } else {
    $('.loading', $playlistSect).hide();
  }
}

function openPopup(uri) {
  window.open(uri, 'titolo', 'width=800, height=600, resizable, status, scrollbars=1, location');
}

function selectChap(chapNum) {
  const chapNumLast = $('.chap-num:last')[0].innerText;
  $('.chap-link').removeClass('selected-chap');

  $(this).addClass('selected-chap');
  const isOpening = (chapNum === '0');
  if (!isOpening) {
    $('.first-part').text('chapter ');
    $('.selected-chap-num').text(chapNum);
    $('.last-part').text(` of ${chapNumLast}`);
  }
  $('.hide-on-intro').toggle(!isOpening);
  $('.intro').toggle(isOpening);
}

function updateMFurl() {
  const mf = $player.getMFJson();
  const { hash } = mf;

  const hashString = Object.entries(hash).map((entry) => {
    const [key, val] = entry;
    return `${key}=${val[0].value}`;
  }).join('&');

  window.location.hash = hashString;
  setLocation('t');
  setLocation('xywh');

  highlightMFSub(hash.t[0].value);
  showTEDSuggestedChaps();
}

function timeToSec(hms) {
  const time = (hms.split(':'));
  const hh = parseInt(time[0]);
  const mm = parseInt(time[1]);
  const ss = parseInt(time[2]);

  return ((mm * 60) + (hh * 3600) + ss);
}

function highlightMFSub(t) {
  let sMF;
  let eMF;
  let sMFtest;
  let eMFtest;

  t = t.replace('npt:', '');

  if (t.includes(',')) {
    const mfTime = (t.split(','));
    [sMFtest, eMFtest] = mfTime;
    sMFtest = sMFtest.length > 0 ? sMFtest : '0';
  } else {
    sMFtest = t;
    eMFtest = '86400';
  }

  sMF = !sMFtest.includes(':') ? sMFtest : timeToSec(sMFtest);
  eMF = !eMFtest.includes(':') ? eMFtest : timeToSec(eMFtest);
  sMF = parseFloat(sMF);
  eMF = parseFloat(eMF);

  $('.sub-text p').removeClass('selected-frag').each((_i, el) => {
    const eSub = parseFloat($(el).data('endss'));

    if (sMF < eSub && eMF >= eSub) {
      $(el).addClass('selected-frag');
      $(el).siblings('.chap-title').addClass('selected-frag');
    }
  });
  const $firstSelFrag = $('.selected-frag:first');

  if ($firstSelFrag.length) {
    const $subText = $('.sub-text');
    const scrollPos = $firstSelFrag.position().top + $subText.scrollTop();

    $subText.animate({ scrollTop: scrollPos });
  } else {
    console.warn('No subtitles in this fragment. Are you sure that the fragment is inside video duration?');
  }
}

function calcDivWidth(startTime, endTime) {
  const totWidth = ($player.getDuration() / 1000);
  return ((endTime - startTime) / totWidth) * 100;
}

function calcSpaceWidth(startTime, oldEndTime) {
  const totWidth = ($player.getDuration() / 1000);
  return ((startTime - oldEndTime) / totWidth) * 100;
}

function displayPins() {
  const $pin = $('.pin');
  $pin.each((_i, el) => {
    const $this = $(el);

    $this.qtip({
      content: {
        text: $('.qtipEnt', $this).html(),
        title: $('.qtipTitle', $this).html(),
      },
      style: {
        classes: 'qtip-light qtip-rounded',
        padding: '15px',
        tip: 'bottom middle',
      },
      position: {
        my: 'bottom center',
        at: 'top center',
      },
      hide: {
        fixed: true,
        delay: 300,
      },
    });
  });

  $pin.show();

  let oldEnd = 0;


  $pin.each((_i, el) => {
    const $hotSpot = $(el).children('a');
    const startHS = $hotSpot.data('start-time');
    const endHS = $hotSpot.data('end-time');

    const width = calcDivWidth(startHS, endHS);
    $(el).css('width', `${width}%`);

    if (oldEnd < startHS) {
      const spaceWidth = calcSpaceWidth(startHS, oldEnd);
      $(el).css('margin-left', `${spaceWidth}%`);
    }
    oldEnd = endHS;


    $(el).on('click', () => {
      $player.setmf(`t=${startHS},${endHS}`).playmf();
      updateMFurl();
    });
    if ($('.pinEnt', $(el)).width >= $(el).width) $('.pinEnt', $(el)).css('max-width', $(el).width - 15);
  });


  const $suggCourses = $('#suggested-courses');
  if ($('.chap-link').length) $suggCourses.loadTemplate($('#courseList'), {});

  if ($pin.length) {
    $('.invite', $suggCourses).hide();
    $('.loading', $suggCourses).show();

    $.ajax({
      url: '/HyperTED/courses',
      data: {
        uuid: video.uuid,
      },
    }).done((data) => {
      $('.loading', $suggCourses).hide();
      const $coursesList = $('#courses-list');
      if (!data.length) return;
      for (const course of data.slice(0, 2)) {
        $coursesList.loadTemplate($('#course'), {
          url: course.locator.value,
          title: course.title.value,
          thumb: `\\HyperTED\\img\\logos\\${course.source}.png`,
        }, { append: true });
      }
      $coursesList.on('click', 'a', (e) => {
        e.preventDefault();
        openPopup($(e.currentTarget).attr('href'));
      });
    }).fail(() => {
      $('.loading', $suggCourses).hide();
    });
  } else {
    $('.invite', $suggCourses).show();
    $('.loading', $suggCourses).hide();
  }
}

function displayChapters() {
  $('#video-info-chapters').show();
  const $chapLinks = $('.chap-link');
  const totChapters = $chapLinks.length;

  $chapLinks.each((index, el) => {
    const $chapNum = $(el).find('.chap-num');

    const $chapter = $(el).children('a');
    const startChapter = $chapter.data('start-time');
    const endChapter = $chapter.data('end-time');

    if (!$('.chap-link').data('duration')) {
      let chapWidth;
      if (index === totChapters - 1) {
        chapWidth = calcDivWidth(startChapter, ($player.getDuration() / 1000));
      } else chapWidth = calcDivWidth(startChapter, endChapter);

      $(el).css('width', `${chapWidth}%`);
    }

    $(el).hover(() => {
      if ($(el).width() < 175) {
        const opt = {
          top: '16px',
          opacity: '1',
          cursor: 'auto',
        };

        if (index > Math.floor(totChapters / 2)) opt.right = 0;
        $chapter.children('.chap-timing').css(opt);
      }
    });

    $(el).on('click', () => {
      $player.setmf(`t=${startChapter},${endChapter}`).playmf();
      const chapNum = $chapNum[0].innerText;

      selectChap(chapNum);
      updateMFurl();
    });
  });

  setTimeout(() => {
    $('.chap-link').each((_i, el) => {
      const $chapNum = $(el).find('.chap-num');
      if ($(el).width() >= 25) {
        $chapNum.show();
        $chapNum.css('display', 'inline-block');
      }
    });
  }, 500);
}

function highlightSubLine(time) {
  // Higlight 1 line of subtitles given the time

  $('.sub-text p[data-time]')
    .removeClass('now-playing')
    .filter((_i, line) => {
      const $line = $(line);
      const start = $line.data('startss');
      const end = $line.data('endss');
      return start <= time && end > time;
    })
    .first()
    .addClass('now-playing');
}

function init() {
  // resize navbar on scroll
  const $navbar = $('.navbar').not('.navbar-placeholder');
  const navHeight = $navbar.height();
  $(window).scroll(() => {
    $navbar.toggleClass('compact', $(window).scrollTop() > navHeight);
  });

  const $subCont = $('#sub-cont');
  const hasVideoSub = $subCont.exists();

  // init smfplayer
  const $playerSect = $('#player-sect');
  $player = $('#video').smfplayer({
    mfURI: videoUri,
    spatialOverlay: true,
    temporalHighlight: true,
    width: 640,
    height: 360,
    alwaysShowControls: true,
    preload: 'metadata',
    features: ['playpause', 'current', 'progress', 'duration', 'volume'],
    autoStart: false, // TODO remove
    success(media) {
      showTEDSuggestedChaps();

      $(media)
        .one('loadedmetadata', () => {
          displayChapters();
          displayPins();

          const { t } = $player.getMFJson().hash;
          if (t && t !== 'NULL') {
            highlightMFSub(t[0].value);
            const $selFrag = $('.selected-frag');
            if ($selFrag.exists() && $selFrag.hasClass('chap-title')) {
              const chapId = $selFrag.parent().data('chapter');
              selectChap(chapId);
            }
          }
          showTEDSuggestedChaps();
        })
        .on('timeupdate', (evt) => highlightSubLine(evt.target.currentTime))
        .on('play', () => $('.info-on-player', $playerSect).hide())
        .on('pause', () => $('.info-on-player', $playerSect).show());
    },
  });
  video.player = $player;
  console.debug($player);


  // play/pause clicking on the video
  let isPlaying = false;
  $('.mejs-inner').on('click', () => {
    if (isPlaying) {
      $player.pause();
      isPlaying = false;
    } else {
      $player.play();
      isPlaying = true;
    }
  });

  // Nerdify form become an ajax form
  const $nerdifyForm = $('form.nerdify');
  const ajaxAction = $nerdifyForm.data('action');

  $nerdifyForm.attr('action', ajaxAction).submit((evt) => {
    evt.preventDefault();
    const $submitButton = $('button[type="submit"]', $nerdifyForm);
    $submitButton.width($submitButton.width()).prop('disabled', true).html('<img src="/HyperTED/img/ajax-loader-greyRed.gif"><img src="/HyperTED/img/ajax-loader-greyRed.gif"><img src="/HyperTED/img/ajax-loader-greyRed.gif">');

    const extractor = $('.nerdSelect select', $nerdifyForm).val();


    // if entities are in LocalStorage, get them and go on
    const entitiesLS = getFromLocalStorage(videokey + extractor);
    if (entitiesLS) {
      $submitButton.prop('disabled', false).html('Nerdify');
      setLocation('enriched', extractor);
      onEntitiesToShow(entitiesLS);
      showTEDSuggestedChaps();
      return false;
    }

    $nerdifyForm.ajaxSubmit({
      success(data) {
        try {
          if (data.error) {
            const alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
            alert.appendTo($nerdifyForm).alert();
            $submitButton.prop('disabled', false).html('Nerdify');
            console.error(data.error);
            return;
          }
        } catch (e) {
          console.error(e);
          // DO NOTHING
        }

        saveInLocalStorage(videokey + extractor, data);

        $submitButton.prop('disabled', false).html('Nerdify');
        setLocation('enriched', extractor);
        onEntitiesToShow(data);
        showTEDSuggestedChaps();
      },
      error() {
        const alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
        alert.appendTo($nerdifyForm).alert();
        $submitButton.removeLoader();
        console.error('Something went wrong');
      },
    });
  });

  $('#recommend').on('click', function recommendClick() {
    $(this).hide();
    $('.see-also').show();
    $('#suggested-courses').show();
  });


  // ask for hotspots
  $('#hotspot-form').submit(function computeHS(e) {
    e.preventDefault();
    const errText = 'We can not generate hotspots for this video. This functionality is only available for TED Talks';
    const $form = $(this);
    const $button = $('button', $form);
    $button.width($button.width()).prop('disabled', true).html('<img src="/HyperTED/img/ajax-loader-white.gif"><img src="/HyperTED/img/ajax-loader-white.gif"><img src="/HyperTED/img/ajax-loader-white.gif">');
    $(this).ajaxSubmit({
      success(data) {
        let text;
        try {
          if (data.error) {
            text = errText;
            $button.text().css('width', 'auto');
            console.error(data.error);
            return;
          }
          // text = 'The request was sent successfully. Came back later to see hotspots.'
          // location.reload(true);
          $('#hotspots-cont .hscont-inner').html($(data).find('.hscont-inner'));
          $form.hide();
          displayPins();
          setLocation('hotspotted', true);
        } catch (e) {
          text = errText;
          console.error(text);
          console.log(e);
        }
        const $p = $('<p>').text(text);
        $button.children().hide();
        $button.append($p).width($p.width());
        setTimeout(() => {
          $button.append($p);
          $p.css('opacity', 1);
        }, 600);
      },
      error() {
        const text = errText;

        const $p = $('<p>').text(text);
        $button.children().hide();
        $button.append($p).width($p.width());
        $p.css('opacity', 1);

        console.error(data.error);
      },
    });
  });

  $plainSubCont = $('.sub-text');
  if (video.entitiesL) onEntitiesToShow(video.entitiesL);


  // managing of click on a sub
  // 1: in a chapter
  $(document).on('click', '.sub-text p[data-chapter]', (e) => {
    e.preventDefault();
    const chapId = $(e.currentTarget).data('chapter');
    $(`#ch${chapId}`).click();
  });

  // 2: not in a chapter
  $(document).on('click', '.sub-text p[data-time]:not([data-chapter])', function onSubtextClick() {
    const srtTime = $(this).data('time');
    const hms = srtTime.replace(/,/g, '.').replace(' --> ', ',');
    $player.setmf(`t=${hms}`).playmf();
    $('.chap-link').removeClass('selected-chap');
    updateMFurl();
  });


  $('#video-info-chapters').show();
  const $chapLinks = $('.chap-link');
  if (!$chapLinks.first().data('duration')) {
    const $totChapters = $chapLinks.length;
    $chapLinks.each((_i, el) => $(el).css('width', `${100 / $totChapters}%`));
  }


  // Browser back and forward
  $(window).off('popstate').on('popstate', () => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace('#', ''));

    // media fragment
    let frag;
    const t = search.get('t') || hash.get('t');
    if (t) frag = `t=${t}`;

    const xywh = search.get('xywh') || hash.get('xywh');
    if (xywh) frag = frag ? `${frag}&xywh=${xywh}` : `xywh=${xywh}`;

    if (frag) {
      console.info(`popstate! new fragment: ${frag}`);

      $player.setmf(frag);
      if (hasVideoSub) highlightMFSub(t);
    }

    // hotspotted
    const hotspotted = search.get('hotspotted');
    if (hotspotted) {
      $('#hotspot-form').submit();
    } else {
      $('.hscont-inner').hide();
      $('.btn-hotspot').text('GENERATE HOTSPOTS').removeAttr('style').prop('disabled', false);
      $('#hotspot-form').show();
    }

    // nerdification
    const extractor = search.get('enriched');
    if (extractor) {
      console.info(`popstate! new extractor: ${extractor}`);
      $('.nerdSelect select').val(extractor).change();
      const ents = getFromLocalStorage(videokey + extractor);

      if (ents) onEntitiesToShow(ents);
      else $('form.nerdify').submit();
    } else {
      $('#entity-sect').hide();
      if ($('.sub-text').find('.entity').length > 0) displayEntitiesSub([]);
    }

    showTEDSuggestedChaps();
  });
}

$(document).ready(init);

jQuery.fn.extend({
  addLoader(direction) {
    if (!jQuery.loaderImg) {
      jQuery.loaderImg = $('<img>').attr('src', `${baseUri}/img/ajax-loader.gif`);
    }

    const $loaderImg = jQuery.loaderImg;
    jQuery.loaderImg = $loaderImg.clone();
    if (direction === 'left') $(this).before($loaderImg);
    else $(this).after($loaderImg);

    $(this).data('loader', $loaderImg);
    return true;
  },
  removeLoader() {
    const loader = $(this).data('loader');
    $(loader).remove();
  },
  exists() {
    return $(this).length > 0;
  },
});

function getFromLocalStorage(key) {
  try {
    const dataLS = localStorage[key];
    if (!dataLS) return null;
    const data = JSON.parse(dataLS);
    return data.value;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function saveInLocalStorage(key, value) {
  try {
    localStorage[key] = JSON.stringify({ timestamp: Date.now(), value });
  } catch (e) {
    console.log(e);
    if (e === DOMException.QUOTA_EXCEEDED_ERR || e.code === DOMException.QUOTA_EXCEEDED_ERR) {
      console.warn('Quota exceeded! Delete all and write');
      localStorage.clear();
      saveInLocalStorage(key, value);
    }
  }
}


function displayEntitiesSub(entJson) {
  const $newSubCont = $plainSubCont.clone();
  const $subList = $newSubCont.find('p');
  const entityList = entJson;

  // sorting JSON for end character desc and by length
  entityList.sort(
    /**
     * @return {number}
     */
    (x, y) => {
      if (x.endNPT === y.endNPT) {
        return ((x.label.length == y.label.length) ? 0 : (x.label.length < y.label.length) ? 1 : -1);
      } if (parseFloat(x.endNPT) > parseFloat(y.endNPT)) return -1;
      return 1;
    },
  );
  let subIndex = $subList.length - 1;
  entityList.forEach((entity) => {
    while (subIndex >= 0) {
      let $thisSub = $subList.get(subIndex);
      if (!$thisSub.id) {
        subIndex--;
      } else {
        const entStart = parseFloat(entity.startNPT).toFixed(2);
        const entEnd = parseFloat(entity.endNPT).toFixed(2);
        $thisSub = $($thisSub);
        const subStart = parseFloat($thisSub.data('startss')).toFixed(2);
        const subEnd = parseFloat($thisSub.data('endss')).toFixed(2);
        if (entStart >= subStart && entEnd <= subEnd) {
          const text = $thisSub[0].innerHTML;
          const nerdTypeSplit = entity.nerdType.split('#');
          const nerdType = nerdTypeSplit.length > 1 ? nerdTypeSplit[1].toLowerCase() : 'thing';

          const str = `<span class="entity ${nerdType}">${entity.label}</span>`;

          const replace = text.replace(entity.label, str);
          $thisSub.html(replace);
          break;
        } else {
          subIndex--;
        }
      }
    }
  });

  $('.sub-text', document).replaceWith($newSubCont);
  $('p > span.entity').has('span').addClass('nesting');
}


function showEntityList(entityList) {
  $('.template-list-rows').empty();
  $('#entity-sect').show();

  entityList.sort(
    (x, y) => ((x.nerdType == y.nerdType) ? 0 : ((x.nerdType > y.nerdType) ? 1 : -1)),
  );

  const typeList = entityList.reduce((memo, ent) => {
    if (!memo[ent.nerdType]) {
      memo[ent.nerdType] = [];
    }
    memo[ent.nerdType].push(ent);
    return memo;
  }, {});

  const extr = $('select[name=enriched] option:selected').text();
  $('.totEnt').html(entityList.length);
  $('.extEnt').html(extr.toUpperCase());

  for (const [type, entities] of Object.entries(typeList)) {
    const typeName = type.split('#')[1];

    const $row = $('<div>').loadTemplate($('#templateType'), {
      typeAndOccurrences: `${entities.length} ${typeName}`,
    }).appendTo('.template-list-rows');
    entities.forEach((ent) => {
      const $e = $('<li>').loadTemplate($('#templateEnt'), {
        entA: ent.label,
      });
      $('.displayEntity', $row).append($e);

      $('.entity.list', $e).addClass((typeName.toLowerCase()));
      if (ent.uri) $('span>a', $e).attr('href', ent.uri).attr('target', '_blank');
    });
  }
}

function onEntitiesToShow(entJson) {
  displayEntitiesSub(entJson);
  showEntityList(entJson);
}
