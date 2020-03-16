import axios from 'axios';

import url from 'url';
import moment from 'moment';

import Promise from 'bluebird';
import mfParser from 'mediafragment';
import elasticsearch from '@elastic/elasticsearch';
import validUrl from 'valid-url';
import nerdify from './nerdify';
import db from './database';
import ts from './linkedTVconnection';
import courseSuggestion from './course_suggestion';
import errorMsg from './error_msg';
import config from '../config.json';

import topic from './topic';

const NodeCache = require('node-cache');

const cache = new NodeCache();

console.info(config);

const LOG_TAG = '[VIDEO.JS]: ';
const hStatusValue = {
  IN_PROGRESS: 1,
  DONE: 2,
};


const client = new elasticsearch.Client({
  node: config.elastic,
  log: 'trace',
});

const time1d = 86400000; // one day
const time1w = 7 * time1d; // one week

const TEDListQuery = 'https://api.ted.com/v1/talks.json?api-key=uzdyad5pnc2mv2dd8r8vd65c&limit=100&externals=false&filter=id:>';

const vendors = {
  youtube: {
    name: 'youtube',
    url_pattern: /(youtu.be\/|youtube.com\/(watch\?(.*&)?v=|(embed|v)\/))([^?&"'>]+)/,
    metadataUrl: 'http://gdata.youtube.com/feeds/api/videos/<id>?v=2&alt=json-in-script',
    sub_url: 'http://www.youtube.com/api/timedtext?lang=en&format=srt&v=<id>',
  },
  dailymotion: {
    name: 'dailymotion',
    url_pattern: /dailymotion.com\/(video|hub)\/([^_]+)/,
    metadataUrl: 'https://api.dailymotion.com/video/<id>?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre',
    sub_list_url: 'https://api.dailymotion.com/video/<id>/subtitles?fields=id,language%2Curl',
  },
  vimeo: {
    name: 'vimeo',
    url_pattern: /(www.)?(player.)?vimeo.com\/([a-z]*\/)*([0-9]{6,11})[?]?.*/,
    metadataUrl: 'http://vimeo.com/api/v2/video/<id>.json',
  },
  ted: {
    name: 'ted',
    url_pattern: /^https?:\/\/(?:www\.)?ted\.com\/talks\/*([^?]+)/,
    metadataUrl: 'https://api.ted.com/v1/talks/<id>.json?api-key=uzdyad5pnc2mv2dd8r8vd65c',
    sub_url: 'https://api.ted.com/v1/talks/<id>/subtitles.json?api-key=uzdyad5pnc2mv2dd8r8vd65c',
  },
};

function detectVendor(uri) {
  for (const [k, v] of Object.entries(vendors)) {
    const matches = uri.match(v.url_pattern);
    if (matches) return [k, String(matches[matches.length - 1])];
  }
  return [];
}

/* from srt to a json ready to be used in render */
function srtToJson(srt, chapters) {
  let strList = srt.split('\n\n'); const
    subList = [];
  if (strList.length < 2) {
    strList = srt.substr(1).split('\n\r');
  }
  let charIndex = -1;

  function calcTime(subtitleTime) {
    const time = (subtitleTime.split(':'));
    const hh = parseInt(time[0]);
    const mm = parseInt(time[1]);
    const ss = parseFloat(time[2].replace(',', '.'));

    return ((mm * 60) + (hh * 3600) + ss);
  }

  for (const str of strList) {
    const sub = { text: '', lineNum: 0 };
    const lines = str.split('\n');

    for (const line of lines) {
      if (!sub.id) {
        sub.id = line.trim();
      } else if (!sub.time) {
        sub.time = line.replace('\r', '');
        const timeSplit = sub.time.split(' --> ');
        const subStart = calcTime(timeSplit[0]);
        sub.startSS = Math.round(subStart * 1000) / 1000;
        const subEnd = calcTime(timeSplit[1]);
        sub.endSS = Math.round(subEnd * 1000) / 1000;
      } else {
        const start = sub.lineNum > 0 ? '\n' : '';
        sub.text += start + line;
        sub.lineNum++;
      }
    }

    sub.startChar = charIndex + 1;
    charIndex = sub.startChar + sub.text.length; // because of a '\n' is a fake double char
    sub.endChar = charIndex;
    if (sub.id) subList.push(sub);
  }

  if (chapters) {
    let subIndex = 0;

    for (const [k, chap] of Object.entries(chapters)) {
      let chapStart;
      let chapEnd;
      if (chap.tStart) {
        chapStart = Math.round(chap.tStart.value);
        chapEnd = Math.round(chap.tEnd.value);
      } else {
        chapStart = chap.startNPT;
        chapEnd = chap.endNPT;
      }

      while (subIndex < subList.length) {
        const thisSub = subList[subIndex];
        thisSub.chapNum = k;
        if (!thisSub.id) {
          ++subIndex;
        } else {
          const sEnd = thisSub.endSS;
          if (chapStart > sEnd) {
            // chapter not yet started: go next sub
            subIndex++;
          } else if (chapStart <= sEnd && chapEnd >= sEnd) {
            // we are in a chapter: save this info and go next sub
            // thisSub.dataChap = ' data-chapter=' + c.chapter.value.replace("http://data.linkedtv.eu/chapter/", "");
            thisSub.dataChap = ` data-chapter=${k}`;
            subIndex++;
          } else {
            // chapter ends: go next chapter
            if (subIndex > 0) subList[subIndex - 1].endChap = true;

            break;
          }
        }
      }
    }
    subList[subList.length - 1].endChap = true;
  }
  return subList;
}


function renderVideo(res, video, options) {
  if (video.timedtext) video.subtitles = srtToJson(video.timedtext, video.chapters);

  const source = Object.assign({}, video, options); // eslint-disable-line prefer-object-spread
  res.render('video.ejs', source);
}


/*
 * Prepare and render a video already in db
 */
function viewVideo(req, res, video) {
  const { enriched, hotspotted } = req.query;
  let videoURI = video.videoLocator || video.locator;

  // Identify the media fragment part
  const mf = mfParser.parse(req.url);
  if (mf.toUrlString()) {
    const concSign = url.parse(videoURI).hash ? '&' : '#';
    videoURI += concSign + mf.toUrlString().substr(1);
  }

  const options = {
    videoURI,
    enriched,
    hotspotted: !!hotspotted,
  };

  // Prepare nerd entity part
  if (!enriched || !video.timedtext) {
    // enrichment is not requested or we can not enrich
    renderVideo(res, video, options);
  } else if (video.entities && containsExtractor(video.entities, enriched)) {
    // we have already enriched with this extractor
    video.entities = video.entities.filter(hasExtractor, enriched);
    renderVideo(res, video, options);
  } else {
    // we have to retrive entities from NERD
    getEntities(video, enriched).then((data) => {
      video.entities = data;
      renderVideo(res, video, options);
    }).catch((err) => {
      console.log(`${LOG_TAG} error in getEntity: ${err.message}`);
      options.error = 'Sorry. We are not able to retrieving NERD entities now.';
    }).finally(() => renderVideo(res, video, options));
  }
}

function getMetadataFromSparql(video) {
  let sparqlData;
  return ts.getVideoFromLocator(video.locator)
    .then((data) => {
      sparqlData = data;
      return getSubtitlesTV2RDF(sparqlData.ltv_uuid);
    }).then((data) => {
      if (data) sparqlData.timedtext = data;
      else console.log('No sub obtained from sparql');

      return sparqlData;
    });
}


function getMetadata(video) {
  if (!video.vendor || !video.vendor_id) return Promise.reject(new Error('No vendor or id available'));

  const metadata = video.metadata || {};
  const vendor = vendors[video.vendor];
  const metadataUrl = vendor.metadataUrl.replace('<id>', video.vendor_id);

  let subUrl;
  switch (vendor.name) {
    case 'youtube':
      subUrl = vendor.sub_url.replace('<id>', video.vendor_id);
      return Promise.each([
        axios.get(metadataUrl) // 1. retrieve metadata
          .then((r) => {
            const { data } = r;

            metadata.title = data.entry.title.$t;
            metadata.thumb = data.entry.media$group.media$thumbnail[0].url;
            metadata.descr = data.entry.media$group.media$description.$t.replace(new RegExp('<br />', 'g'), '\n');
            metadata.views = data.entry.yt$statistics.viewCount;
            metadata.favourites = data.entry.yt$statistics.favoriteCount;
            metadata.comments = data.entry.gd$comments
              ? data.entry.gd$comments.gd$feedLink.countHint : 0;
            metadata.likes = data.entry.yt$rating ? data.entry.yt$rating.numLikes : 0;
            metadata.avgRate = data.entry.gd$rating ? data.entry.gd$rating.average : 0;
            metadata.published = data.entry.published.$t;
            metadata.category = data.entry.category[1].term;
          })
          .catch((err) => console.error(`[ERROR] on retrieving metadata from ${metadataUrl}`, err)),
        axios.get(subUrl, { responseType: 'text' }) // 2. retrieve sub
          .then((r) => {
            video.timedtext = r.data;
          }).catch((err) => {
            console.error(`[ERROR] on retrieving sub for ${video.locator}`, err);
          }),
      ]).then(() => metadata);
    case 'dailymotion':
      subUrl = vendor.sub_list_url.replace('<id>', video.vendor_id);
      return Promise.each([
        axios.get(metadataUrl) // 1. retrieve metadata
          .then((r) => {
            const { data } = r;

            metadata.title = data.title;
            metadata.thumb = data.thumbnail_60_url;
            metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
            metadata.views = data.views_total;
            metadata.favourites = data.bookmarks_total;
            metadata.comments = data.comments_total;
            metadata.likes = data.ratings_total;
            metadata.avgRate = data.rating;
            metadata.published = `${moment.unix(data.created_time).format('YYYY-MM-DD')}`;
            metadata.category = data.genre;
          })
          .catch((err) => console.error(`[ERROR] on retrieving metadata from ${metadataUrl}`, err)),
        axios.get(subUrl) // 2. retrieve sub
          .then((r) => {
            const { data } = r;
            if (data.total <= 0) return console.log('no sub available');

            subUrl = (data.list[0].url);
            return axios.get(subUrl, { responseType: 'text' }).then((sub) => {
              video.timedtext = sub;
            });
          }).catch((err) => {
            console.error(`[ERROR] on retrieving sub for ${video.locator}`, err);
          }),
      ]).then(() => metadata);
    case 'vimeo':
      return axios.get(metadataUrl)
        .then((r) => {
          const { data } = r;

          metadata.title = data.title;
          metadata.thumb = data.thumbnail_small;
          metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
          metadata.views = data.stats_number_of_plays;
          metadata.favourites = 'n.a.';
          metadata.comments = data.stats_number_of_comments;
          metadata.likes = data.stats_number_of_likes;
          metadata.avgRate = 'n.a.';
          metadata.published = data.upload_date;
          metadata.category = data.tags;
          return metadata;
        })
        .catch((err) => console.error(`[ERROR] on retrieving metadata from ${metadataUrl}`, err));
    case 'ted':
      return axios.get(metadataUrl)
        .then(async (r) => {
          const { data } = r;

          const datatalk = data.talk;
          video.videoLocator = (datatalk.media.internal ? datatalk.media.internal['950k'] || datatalk.media.internal['600k'] : datatalk.media.external).uri;
          video.vendor_id = String(datatalk.id);
          metadata.title = datatalk.name;
          if (datatalk.images) {
            metadata.thumb = datatalk.images[1].image.url;
            metadata.poster = datatalk.images[2].image.url;
          }
          metadata.descr = datatalk.description.replace(new RegExp('<br />', 'g'), '\n');
          metadata.views = datatalk.viewed_count;
          metadata.comments = datatalk.commented_count;
          metadata.published = datatalk.published_at;
          metadata.event = datatalk.event.name;

          subUrl = vendors.ted.sub_url.replace('<id>', video.vendor_id);

          const x = await axios.get(subUrl);
          return x.data;
        }).then((sub) => {
          video.jsonSub = sub;
          video.chapters = getTedChapters(video.jsonSub);
          video.timedtext = jsonToSrt(video.jsonSub);
          return metadata;
        })
        .catch((err) => {
          if (metadata.title) console.error(`[ERROR ${err}] on retrieving sub for ${video.locator}`);
          else console.error(`[ERROR] on retrieving metadata from ${metadataUrl}`, err);
        });
    default:
      return Promise.reject(new Error('Vendor undefined or not recognized'));
  }
}


function view(req, res) {
  const { uuid } = req.params;
  if (!uuid) return res.render('error.ejs', errorMsg(400));

  return db.getVideoFromUuid(uuid, true)
    .then((video) => {
      if (!video) throw new Error('Video not found');

      let updateFun = () => Promise.resolve(); // fake function

      if (!video.timestamp || Date.now() - video.timestamp > time1w) {
        // UPDATE ALL METADATA
        console.log(`updating metadata for video ${uuid}`);
        video.timestamp = Date.now();
        updateFun = collectMetadata;
      } else if (video.vendor) {
        updateFun = getFickleMetadata;
      }

      return updateFun(video)
        .then(() => db.updateVideoUuid(uuid, video))
        .catch((err) => console.error(err))
        .finally(() => {
          if (video.hotspotStatus === hStatusValue.IN_PROGRESS) {
            // checkHotspotResults(video.uuid, (err, data) => {
            //   if (data) {
            //     video.hotspotStatus = hStatusValue.DONE;
            //     video.hotspots = data;
            //   }
            viewVideo(req, res, video);
            // });
          } else {
            viewVideo(req, res, video);
          }
        });
    })
    .catch((err) => {
      console.error(err);
      res.render('error.ejs', errorMsg(404));
    });
}

function search(req, resp) {
  const videoURI = req.query.uri;
  if (!videoURI) {
    console.log(`${LOG_TAG} No specified video uri.`);
    resp.redirect('/HyperTED');
    return;
  }
  const parsedURI = url.parse(videoURI, true);
  let locator = `${parsedURI.protocol}//${parsedURI.host}${parsedURI.pathname}`;
  let fragPart = '';
  let separator = '?';
  let fragSeparator = '?';

  for (const [key, value] of Object.entries(parsedURI.query)) {
    const parsedQueryUnit = `${key}=${value}`;
    if (['t', 'xywh', 'track', 'id', 'enriched', 'hotspotted'].includes(key)) {
      fragPart += fragSeparator + parsedQueryUnit;
      fragSeparator = '&';
    } else {
      locator += separator + parsedQueryUnit;
      separator = '&';
    }
  }

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'uri') continue;
    fragPart += `${fragSeparator}${key}=${value}`;
  }
  const hashPart = parsedURI.hash || '';

  if (parsedURI.hostname === 'stream17.noterik.com') {
    locator = locator.replace(/rawvideo\/[0-9]\/raw.mp4/, '');
    locator = locator.replace(/\?ticket=.+/, '');
  }

  const [vendor, id] = detectVendor(locator);

  db.getVideoFromLocator(locator)
    .then((data) => {
      if (data) { // video in db
        const redirectUrl = `video/${data.uuid}${fragPart}${hashPart}`;
        console.log(`Video at ${locator} already in db.`);
        console.log(`Redirecting to ${redirectUrl}`);
        resp.redirect(redirectUrl);
        throw new Error('handled');
      }
      return db.getVideoFromVendorId(vendor, id);
    })
    .then((data) => {
      const redirectUrl = `video/${data.uuid}${fragPart}${hashPart}`;
      console.log(`Video at ${locator} already in db.`);
      console.log(`Redirecting to ${redirectUrl}`);
      resp.redirect(redirectUrl);
    }).catch((e) => {
      if (e.message === 'handled') return;
      // new video
      console.log(`${LOG_TAG} Preparing metadata for adding to db`);
      const video = { locator };
      if (vendor && id) {
        video.vendor = vendor;
        video.vendor_id = id;
      }
      if (locator.indexOf('http://stream17.noterik.com/') >= 0) {
        video.videoLocator = `${locator}/rawvideo/2/raw.mp4?ticket=77451bc0-e0bf-11e3-8b68-0800200c9a66`;
      }


      collectMetadata(video)
        .then(() => db.insertVideo(video))
        .then(() => {
          const redirectUrl = `video/${video.uuid}${fragPart}${hashPart}`;
          console.log(`Video at ${locator} successfully added to db.`);
          console.log(`Redirecting to ${redirectUrl}`);
          resp.redirect(redirectUrl);
        })
        .catch((err) => {
          console.error(err);
          resp.render('error.ejs', errorMsg(500));
        });
    });
}

function getEntities(video, ext) {
  console.log(`nerdifing video ${video.uuid} with ${ext}`);
  let docType;
  let text;
  if (video.timedtext) {
    docType = 'timedtext';
    text = video.timedtext;
  } else {
    docType = 'text';
    text = video.metadata.descr;
  }
  return nerdify(docType, text, ext).then((data = []) => {
    if (ext === 'combined') {
      for (const x of data) x.source = 'combined';
    }

    db.addEntities(video.uuid, data);
    return data;
  });
}


/*
 * Called on click on "Nerdify" button
 *
 * Generate an html in response.
 */
function runNerdify(req, res) {
  const { uuid } = req.query;
  const ext = req.query.enriched;

  db.getVideoFromUuid(uuid, true)
    .then((video) => {
      if (!video) throw new Error('no video in the DB');

      console.log(ext);

      if (video.entities && containsExtractor(video.entities, ext)) {
        // we have already enriched with this extractor
        const entities = video.entities.filter(hasExtractor, ext);
        res.json(entities);
        video.enriched = ext;
        // res.render('nerdify_resp.ejs', video);

        return true;
      }
      console.log(`${LOG_TAG} nerdifying ${uuid}`);
      return getEntities(video, ext)
        .then((data) => {
          res.json(data);
          // video.entities = data;
          video.enriched = ext;
          // res.render('nerdify_resp.ejs', video);
        });
    }).catch((e) => {
      console.error(e);
      res.json({ error: 'Error in nerdify' });
    });
}

/*
 * Collect metadata form all sources.
 * Used for new video (search)
 */
function collectMetadata(video) {
  // 1. search for metadata in linkedTV sparql
  return getMetadataFromSparql(video)
    .then((data) => {
      video = Object.assign(video, data); // eslint-disable-line prefer-object-spread

      if (data.chapters) {
        video.chapters = Object.entries(video.chapters).map((v) => {
          const [c, curChap] = v;
          // hypothesis: chapter timing is in seconds
          return {
            source: 'data.linkedtv.eu',
            startNPT: curChap.tStart.value,
            endNPT: curChap.tEnd.value,
            chapNum: c,
            uuid: data.uuid,
            chapterUri: curChap.chapter.value,
            mediaFragmentUri: curChap.mediafragment.value,
          };
        });
      }
    }).catch((err) => {
      console.error('No data obtained from LinkedTV: ', err.message);
      // 2. search metadata with vendor's api
    }).finally(() => getMetadata(video).then((metadata) => {
      if (!metadata) console.log(`${LOG_TAG} Metadata unavailable.`);
      else video.metadata = metadata;
    }));
}


/*
 * Retrieve the part of metadata that change constantly
 * (i.e. #views, #likes,...)
 */
function getFickleMetadata(video = {}) {
  if (!video.vendor || !video.vendor_id) return Promise.reject(new Error('Not vendor or id available'));

  const metadata = video.metadata || {};
  const vendor = vendors[video.vendor];
  const metadataUrl = vendor.metadataUrl.replace('<id>', video.vendor_id);

  switch (vendor.name) {
    case 'youtube':
      return axios.get(metadataUrl).then((r) => {
        const { data } = r;

        metadata.title = data.entry.title.$t;
        metadata.thumb = data.entry.media$group.media$thumbnail[0].url;
        metadata.descr = data.entry.media$group.media$description.$t.replace(new RegExp('<br />', 'g'), '\n');
        metadata.views = data.entry.yt$statistics.viewCount;
        metadata.favourites = data.entry.yt$statistics.favoriteCount;
        metadata.comments = data.entry.gd$comments
          ? data.entry.gd$comments.gd$feedLink.countHint : 0;
        metadata.likes = data.entry.yt$rating ? data.entry.yt$rating.numLikes : 0;
        metadata.avgRate = data.entry.gd$rating ? data.entry.gd$rating.average : 0;
        metadata.published = data.entry.published.$t;
        metadata.category = data.entry.category[1].term;

        video.metadata = metadata;
        return video;
      });
    case 'dailymotion':
      return axios.get(metadataUrl).then((r) => {
        const { data } = r;

        metadata.title = data.title;
        metadata.thumb = data.thumbnail_60_url;
        metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
        metadata.views = data.views_total;
        metadata.favourites = data.bookmarks_total;
        metadata.comments = data.comments_total;
        metadata.likes = data.ratings_total;
        metadata.avgRate = data.rating;
        metadata.published = `${moment.unix(data.created_time).format('YYYY-MM-DD')}`;
        metadata.category = data.genre;

        video.metadata = metadata;
        return video;
      });
    case 'vimeo':
      return axios.get(metadataUrl).then((r) => {
        const { data } = r;

        metadata.title = data.title;
        metadata.thumb = data.thumbnail_small;
        metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
        metadata.views = data.stats_number_of_plays;
        metadata.favourites = 'n.a.';
        metadata.comments = data.stats_number_of_comments;
        metadata.likes = data.stats_number_of_likes;
        metadata.avgRate = 'n.a.';
        metadata.published = `${data.upload_date}`;
        metadata.category = data.tags;

        video.metadata = metadata;
        return video;
      });
    case 'ted':
      return axios.get(metadataUrl).then((r) => {
        const { data } = r;

        const datatalk = data.talk;
        video.videoLocator = (datatalk.media.internal ? datatalk.media.internal['950k'] || datatalk.media.internal['600k'] : datatalk.media.external).uri;
        video.vendor_id = String(datatalk.id);
        metadata.title = datatalk.name;
        if (datatalk.images) {
          metadata.thumb = datatalk.images[1].image.url;
          metadata.poster = datatalk.images[2].image.url;
        }
        metadata.descr = datatalk.description.replace(new RegExp('<br />', 'g'), '\n');
        metadata.views = datatalk.viewed_count;
        metadata.comments = datatalk.commented_count;
        metadata.published = datatalk.published_at;
        metadata.event = datatalk.event.name;

        video.metadata = metadata;
        return video;
      });
    default:
      return Promise.reject(new Error('Vendor undefined or not recognized'));
  }
}


function ajaxGetMetadata(req, res) {
  const { uuid } = req.params;
  if (!uuid) return res.json({ error: 'empty uuid' });

  return db.getVideoFromUuid(uuid, false)
    .then((data) => res.json(data.metadata || {}))
    .catch((err) => {
      console.error(err);
      res.json({ error: 'video not found in db' });
    });
}

function sortByRelevance(x, y) {
  if (x.relevance === y.relevance) return 0;
  return ((x.relevance < y.relevance) ? 1 : -1);
}

function suggestHS(searchTopic) {
  return client.search({
    index: 'hyperted',
    type: 'hotspots',
    body: {
      from: 0,
      size: 20,
      query: {
        match: { 'topic_list.label': searchTopic },
      },
    },
  }).then((resp) => resp.body.hits.hits);
}

function suggestMF(searchTerm, searchUri) {
  return client.search({
    index: 'hyperted',
    type: 'entities',
    body: {
      from: 0,
      size: 10,
      query: {
        bool: {
          should: [{ term: { uri: searchUri } },
            {
              multi_match: {
                query: searchTerm,
                fields: ['label', 'abstract'],
              },
            },
          ],
        },
      },
    },
  }).then((resp) => resp.body.hits.hits);
}

function getChaptersFromSuggestion(json) {
  /* eslint-disable no-underscore-dangle */
  return Promise.map(json, (ent) => { // entity
    const { uuid } = ent._source;
    const st = ent._source.startNPT;
    return db.getChaptersAtTime(st, uuid);
  }).then((chapters) => {
    const suggested = {};
    chapters.filter((ch) => !!ch)
      .forEach((c) => {
        let v1 = suggested[c.uuid];
        if (v1) {
          const notExists = v1.chaps.every((ch) => ch.chapNum !== c.chapNum);
          if (notExists) v1.chaps.push(c);
          return;
        }
        v1 = { chaps: [c] };
        suggested[c.uuid] = v1;
      });

    return Promise.map(Object.entries(suggested), async (entry) => {
      const [uuid, value] = entry;
      const vid = await db.getVideoFromUuid(uuid, false);
      value.metadata = vid.metadata;
    }).then(() => suggested);
  });
}


function ajaxSuggestMF(req, res) {
  const { uuid } = req.params;
  const { startMF, endMF, extractor } = req.query;
  if (!uuid) {
    res.json({ error: 'empty uuid' });
    return;
  }
  db.getFilterEntities(uuid, extractor, startMF, endMF)
    .then((doc) => {
      doc.sort(
        /**
         * @return {number}
         * @return {number}
         */
        (x, y) => (sortByRelevance(x, y)),
      );
      const maxdoc = 5;
      doc = (doc.length > maxdoc) ? doc.slice(0, maxdoc) : doc;

      const lab = doc.map((d) => d.label).join('&');
      const uri = doc.filter((d) => d.uri).map((d) => d.uri).join('&');

      return suggestMF(lab, uri)
        .then(getChaptersFromSuggestion)
        .then((vids) => {
          if (vids[uuid]) { // remove fragment that I am watching
            const { chaps } = vids[uuid];
            for (const c in chaps) {
              if (chaps[c].startNPT >= startMF && chaps[c].startNPT < endMF) {
                chaps.splice(c);
              }
            }
            if (!chaps.length) delete vids[uuid];
          }

          const maxVids = 4;
          console.log(Object.entries(vids).slice(0, maxVids));
          const returnObject = {}; // TODO return array
          for (const [k, v] of Object.entries(vids).slice(0, maxVids)) {
            returnObject[k] = v;
          }
          return res.json(returnObject);
        });
    }).catch((err) => { console.log('wawa', err); res.status(500).send(err.message); });
}


function getSubtitlesTV2RDF(uuid) {
  return axios.get(
    `http://linkedtv.eurecom.fr/tv2rdf/api/mediaresource/${uuid}/metadata?metadataType=subtitle`,
    { responseType: 'text' },
  ).then((x) => x.data);
}

function getTedChapters(json, totDuration) {
  let curChap = {
    startNPT: 0,
    source: 'api.ted.com',
    chapNum: 0,
  };
  let cursub;
  const chapters = [];
  let chapNum = 1;
  const subOffset = json._meta.preroll_offset;

  let oldkey = 0;
  for (const [key, value] of Object.entries(json)) {
    if (key === '_meta') continue;
    cursub = value.caption;

    const isStartOfChap = cursub.startOfParagraph;
    if (isStartOfChap) {
      const subStartTime = cursub.startTime;
      const thisChapStart = (subOffset + subStartTime) / 1000;
      curChap.endNPT = thisChapStart;
      chapters.push(curChap);

      if (parseInt(key) === parseInt(oldkey) + 1) {
        chapters.pop();
      } else {
        curChap = {
          startNPT: thisChapStart,
          source: 'api.ted.com',
          chapNum,
        };
        ++chapNum;
      }
      oldkey = key;
    }
  }
  const lasSubEnd = (subOffset + cursub.startTime + cursub.duration) / 1000;
  curChap.endNPT = totDuration || lasSubEnd;
  chapters.push(curChap);
  return chapters;
}


// TODO sistemare
function subTime(time) {
  let fTime;
  let sec;
  if (time < 60) {
    fTime = (time > 9) ? `00:00:${time.toFixed(3)}` : `00:00:0${time.toFixed(3)}`;
  } else if (time === 60 || (time > 60 && time < 3600)) {
    const min = Math.floor(time / 60);
    sec = (time % 60).toFixed(3);
    if (min > 9 && sec > 9) fTime = `00:${min}:${sec}`;
    else if (min < 9 && sec > 9) fTime = `00:0${Math.floor(time / 60)}:${sec}`;
    else fTime = (min > 9 && sec < 9) ? `00:${Math.floor(time / 60)}:0${sec}` : `00:0${min}:0${sec}`;
  } else {
    sec = ((time % 3600) % 60).toFixed(3);
    fTime = (sec > 9) ? `${Math.floor(time / 3600)}:${Math.floor((time % 3600) / 60)}:${sec}` : `${Math.floor(time / 3600)}:${Math.floor((time % 3600) / 60)}:0${sec}`;
  }

  return fTime.replace(/\./g, ',');
}

// public method for url encoding
// TODO replace with a library
function encodeUTF(string) {
  /* eslint-disable no-bitwise */
  string = string.replace(/\r/g, '');
  let utftext = '';

  for (let n = 0; n < string.length; n++) {
    const c = string.charCodeAt(n);

    if (c < 128) {
      utftext += String.fromCharCode(c);
    } else if ((c > 127) && (c < 2048)) {
      utftext += String.fromCharCode((c >> 6) | 192);
      utftext += String.fromCharCode((c & 63) | 128);
    } else {
      utftext += String.fromCharCode((c >> 12) | 224);
      utftext += String.fromCharCode(((c >> 6) & 63) | 128);
      utftext += String.fromCharCode((c & 63) | 128);
    }
  }

  return utftext;
}

/*
 * This function translate subtitles from TED json to srt
 * */
function jsonToSrt(json) {
  let mysrt = '';
  const subOffset = json._meta.preroll_offset;

  for (const [key, value] of Object.entries(json)) {
    if (key === '_meta') continue;
    const sub = value.caption;
    const subStartTime = sub.startTime;
    const subDuration = sub.duration;
    const subContent = sub.content;

    const newStart = (subOffset + subStartTime) / 1000;
    const end = newStart + (subDuration / 1000);

    mysrt += `${key + 1}\n${subTime(newStart)} --> ${subTime(end)}\n${subContent}\n\n`;
  }
  return encodeUTF(mysrt);
}


function loadVideo(index, uuid, retrieveNerd) {
  const video = {
    locator: `https://www.ted.com/talks/${index}`,
    vendor: 'ted',
    vendor_id: index,
  };

  if (uuid) video.uuid = uuid;
  const fun = uuid ? db.updateVideo : db.insertVideo;

  // console.log('-- loading metadata', video);
  return getMetadata(video)
    .then((metadata) => {
      if (!metadata) console.log(`${LOG_TAG} Metadata unavailable.`);
      video.metadata = metadata;
      return fun(video);
    }).then((doc) => {
      // nerdify
      if (retrieveNerd && doc.timedtext) {
        // console.log('-- nerdifying');
        return nerdify('timedtext', doc.timedtext)
          .then((data) => db.addEntities(doc.uuid, data))
          .catch((e) => {
            console.error(`${LOG_TAG} Error in nerd retrieving for ${doc.locator}`);
            console.error(e);
          });
      }
      return null;
      // }).catch((err) => {
      //   console.log(`${LOG_TAG} Video loaded with errors.`);
      //   console.log(LOG_TAG + err);
    });
}


function talksLoop(talk, total, limitQps, retrieveNerd) {
  const index = String(talk.id);
  console.log(new Date(), `| loading video ${index}/${total}`);
  // console.log(talk);

  return db.getVideoFromVendorId('ted', index)
    .then((data) => {
      if (data && db.hasEntities(data.uuid)) {
        console.log('video already in db');
        return Promise.resolve();
      }

      let uuid;
      if (data) uuid = data.uuid;
      return loadVideo(index, uuid, retrieveNerd);
    })
    .then(() => Promise.delay(limitQps))
    .catch((err) => {
      console.error(`ERROR at video ${index}`);
      console.error(err);
    });
}

function retrieveTedTalks(limitQps, retrieveNerd, startIndex = 0) {
  // startIndex is the index from which I want to start
  return axios.get(TEDListQuery + startIndex)
    .then((r) => {
      const { data } = r;
      const { total } = data.counts;
      const current = data.counts.this;
      if (current === 0) return Promise.resolve();
      const last = data.talks[data.talks.length - 1].talk.id;
      return Promise.mapSeries(data.talks, (t) => talksLoop(t.talk, total, limitQps, retrieveNerd))
        .then(() => retrieveTedTalks(limitQps, retrieveNerd, last));
    });
}

function buildDb(req, res) {
  const { start } = req.query;
  const retrieveNerd = true;
  const limitQps = retrieveNerd ? 10200 : 2200; // waiting time

  /* Load the full list of TED Talks */
  retrieveTedTalks(limitQps, retrieveNerd, start)
    .then(() => res.send('Db builded successfully'))
    .catch((err) => {
      console.error(err);
      res.status(500).send('A problem occurred');
    });
}


/*
 * Used to filter entities.
 */
function hasExtractor(ent) {
  if (this === 'combined') return ent.source === 'combined';
  return ent.extractor === this;
}

function containsExtractor(array, ext) {
  let filtered = array.filter(hasExtractor, ext);
  if (ext !== 'combined') {
    filtered = filtered.filter((ent) => ent.source !== 'combined');
  }
  return filtered.length > 0;
}


function runHotspot(req, res) {
  const { uuid } = req.params;
  let mystatus;
  db.getHotspotProcess(uuid)
    .then((status) => {
      mystatus = status;
      if (status && status < 2) {
        res.json({ done: true });
        return false;
      }
      return db.getVideoFromUuid(uuid, true);
    }).then((video) => {
      if (!video) return false;

      if (!mystatus) return runHotspotProcess(video);
      return video;
    })
    .then((v) => {
      if (!v) return;

      res.render('hp_resp.ejs', {
        hotspots: v.hotspots, hotspotted: true, hotspotStatus: 2, chapters: v.chapters,
      });
    })
    .catch((e) => {
      console.error(`DB Error: ${e.message}`);
      res.json({ error: { code: 500, message: e.message } });
    });
}

function runHotspotProcess(video) {
  const { uuid } = video;
  if (!video.chapters) return Promise.reject(new Error(`no chapter for video ${uuid}`));

  const srt = Buffer.from(video.timedtext, 'utf-8');
  const chapterList = video.chapters.map((c) => `${c.startNPT},${c.endNPT}`).join('%23');
  const queryString = `?videoURL=${video.locator}&UUID=${video.uuid}&visualAnalysis=false&chapterList=${chapterList}`;

  console.log(queryString);

  return axios
    .post(`http://linkedtv.eurecom.fr/tedtalks/api/hotspots/generate${queryString}`, null, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': srt.length,
      },
    })
    .then((data) => {
      if (data.toLowerCase().includes('internal error')) {
        throw new Error('internal error');
      }
      if (data.toLowerCase().includes('service temporarily unavailable')) {
        throw new Error('service temporarily unavailable');
      }

      const results = JSON.parse(data);
      if (!results || !results.hp_list) throw new Error('No data');

      const hotspots = results.hp_list;
      console.log(hotspots);
      return db.addHotspots(uuid, hotspots);
    })
    .then(() => db.setHotspotProcess(uuid, hStatusValue.DONE));
}

// function checkHotspotResults(uuid, callback) {
//   console.log('check Hotspot Results');
//   /* Call to services */
//
//   if (results) {
//     db.addHotspots(uuid, results.hotspots, (err) => {
//       if (err) {
//         callback(err);
//         return;
//       }
//       db.setHotspotProcess(uuid, hStatusValue.DONE, (err, data) => {
//         callback(err, results.hotspots);
//       });
//     });
//   } else {
//     callback(true, false);
//   }
// }

function getSuggestedCourses(req, res) {
  const { uuid } = req.params;
  db.getVideoFromUuid(uuid, true)
    .then((video) => {
      if (!video || !video.hotspots) throw new Error('No video or no hotspots');

      const topicList = video.hotspots.map((hs) => {
        hs.topic_list.sort((a, b) => b.finalScore - a.finalScore);
        const mainTopic = hs.topic_list[0];
        return mainTopic && mainTopic.label;
      }).filter((x) => !!x);

      return courseSuggestion(topicList);
    })
    .then((courses) => {
      if (!courses || !courses.length) throw new Error('No course data');
      res.json(courses);
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error });
    });
}

function topicSearch(req, res) {
  const { topic } = req.params;
  console.log(`search for topic: ${topic}`);

  if (!topic) return res.json({ error: 'empty topic' });
  if (validUrl.isUri(topic)) return res.redirect(`video?uri=${topic}`);

  const source = { topic };

  return suggestHS(topic)
    .then((docs) => {
      if (!docs || !docs.length) {
        source.msg = 'No video available for this topic. \nPlease try with another one.';
        res.render('topic_driven_playlist.ejs', source);
        return;
      }

      const suggested = {};
      docs.filter((r) => !!r)
        .forEach((r) => {
          const c = r._source;
          let v1 = suggested[c.uuid];
          if (v1) {
            v1.chaps.push(c);
            return;
          }
          v1 = { chaps: [c] };
          suggested[c.uuid] = v1;
        });

      Promise.map(Object.entries(suggested), (x) => {
        const [uuid, sugg] = x;

        return db.getVideoFromUuid(uuid, false)
          .then((vid) => {
            sugg.metadata = vid.metadata;
          });
      }).then(() => {
        source.suggVids = suggested;
        res.render('topic_driven_playlist.ejs', source);
      });
    })
    .catch((err) => {
      console.error(err);
      res.render('error.ejs', errorMsg(500));
    });
}

function topicModel(req, res) {
  const { uuid } = req.query;
  const { modelname } = req.query;
  const chapterId = req.query.chapter;

  let getSubs;
  if (cache.has(uuid)) {
    const data = cache.get(uuid);
    getSubs = Promise.resolve(data);
  } else {
    getSubs = db.getVideoFromUuid(uuid, true)
      .then((video) => {
        if (!video) throw new Error('no video in the DB');
        let chapter = [];
        const talkSub = [];

        let prevsub = video.jsonSub['0'];
        chapter.push(prevsub.caption.content);
        for (const cursub of Object.values(video.jsonSub)) {
          if (!cursub.caption) continue;
          if (cursub.caption.startOfParagraph && !prevsub.caption.startOfParagraph) {
            // start a new chapter block
            talkSub.push(chapter.join(' '));
            chapter = [];
          }

          chapter.push(cursub.caption.content);
          prevsub = cursub;
        }
        talkSub.push(chapter.join(' '));

        cache.set(uuid, talkSub, 500);
        return talkSub;
      });
  }

  getSubs
    .then((talkSub) => topic(talkSub[chapterId - 1], modelname))
    .then((words) => {
      res.json({ result: words });
    }).catch((message) => {
      console.error(message);
      res.status(400).json({ error: 'Error in topic modeling.' });
    });
}

export default {
  view,
  search,
  runNerdify,
  ajaxGetMetadata,
  ajaxSuggestMF,
  buildDb,
  runHotspot,
  getSuggestedCourses,
  topicSearch,
  topicModel,
};
