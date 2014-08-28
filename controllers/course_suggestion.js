var sparql = require("sparql"),
    async = require("async");

var openUniversity = new sparql.Client('http://data.open.ac.uk/sparql');
openUniversity.prefix_map = {
    'purl': 'http://purl.org/dc/terms/',
    'w3-ont': 'http://www.w3.org/TR/2010/WD-mediaont-10-20100608/',
    'dbpedia': 'http://dbpedia.org/property/',
    'openlearn': 'http://data.open.ac.uk/openlearn/ontology/'
};

var openCourseWare = new sparql.Client('http://data.linkedu.eu/ocw/query');
openCourseWare.prefix_map = {
    'linkedu': 'http://data.linkedu.eu/ontology/',
    'purl': 'http://purl.org/dc/terms/',
    'dbpedia': 'http://dbpedia.org/property/'
};


function getFromOpenUniversity(keywords, callback) {
    // keywords: array to regex
    var regex = "(" + keywords.join(')|(') + ")";

    openUniversity.query('SELECT DISTINCT ?course ?description ?title ?subject ?locator ' +
            ' FROM <http://data.open.ac.uk/context/openlearn>  ' +
            'where {    ' +
            '?course purl:description ?description.   ' +
            ' ?course purl:title ?title.    ' +
//            '?course purl:subject ?subject.    ' +
            '?course w3-ont:locator ?locator.   ' +
            '?course a openlearn:OpenLearnUnit   ' +
            '{  FILTER EXISTS {' +
            '  	  FILTER regex(str(?description), "' + regex + '", "i" )' +
            '  	  FILTER regex(str(?title), "' + regex + '", "i" )' +
            '  	}' +
            '  }UNION	{' +
            '  	FILTER EXISTS {' +
            '  		  FILTER regex(str(?description), "' + regex + '", "i" )' +
            '	}' +
            '  } UNION 	{' +
            '  	FILTER EXISTS {' +
            '  		  FILTER regex(str(?title), "' + regex + '", "i" )' +
            '  	}' +
            '  }' +
            '  }  ',
        function (err, data) {
            if (err || !data) {
                callback(err, data);
                return;
            }

            var cList = data.results.bindings;
            if (!cList || !cList.length) {
                callback(err);
                return;
            }

            // score: first the courses with more matches
            var rg = new RegExp(regex, 'gi');
            cList.forEach(function (c) {
                var s = c.title.value + c.description.value;
                c.score = s.match(rg).length;
                c.source = "openuniversity";
            });

            callback(err, cList);
        }
    );
}

function getFromOpenCourseWare(keywords, callback) {
    // keywords: array to regex
    var regex = "(" + keywords.join(')|(') + ")";

    openCourseWare.query('select DISTINCT  ?course ?title ?subject ?description ?locator ' +
            'where {' +
            ' 	?course a linkedu:OpenEducationalResource.' +
            ' 	?course purl:title ?title.' +
            ' 	?course purl:description ?description.' +
//            ' 	?course purl:subject ?subject.' +
            ' 	?course dbpedia:url ?locator.' +
            ' 	{ 	FILTER EXISTS {' +
            ' 	  FILTER regex(str(?description), "' + regex + '", "i" )' +
            ' 	  FILTER regex(str(?title), "' + regex + '", "i" ) 	' +
            '} }UNION	{ 	FILTER EXISTS {' +
            ' 		  FILTER regex(str(?description), "' + regex + '", "i" )' +
            '	} } UNION 	{ 	FILTER EXISTS {' +
            ' 		  FILTER regex(str(?title), "' + regex + '", "i" )' +
            ' 	} }' +
            '  } LIMIT 1000',
        function (err, data) {
            if (err || !data) {
                callback(err, data);
                return;
            }

            var cwList = data.results.bindings;
            if (!cwList || !cwList.length) {
                callback(err);
                return;
            }

            // scrore: first the courses with more matches
            var rg = new RegExp(regex, 'gi');
            cwList.forEach(function (c) {
                var s = c.title.value + c.description.value;
                c.score = s.match(rg).length;
                c.source = "opencourseware";
            });

            callback(err, cwList);
        }
    );
}

exports.getSuggestedCouses = function (keywords, callback) {
    if (!keywords instanceof Array || !keywords.length) {
        callback(Error('Keywords Parameter must be an array with at least 1 strings'));
        return;
    }

    var dataOU = [], dataOC = [];
    async.parallel([
        function (async_callback) {
            getFromOpenUniversity(keywords, function (err, data) {
                if (err) console.error(err);
                if (data && data.length) dataOU = data;
                async_callback();
            });
        },
        function (async_callback) {
            getFromOpenCourseWare(keywords, function (err, data) {
                if (err) console.error(err);
                if (data && data.length) dataOC = data;
                async_callback();
            });

        }
    ], function (err) {
        var coursesList = dataOU.concat(dataOC);
        if (coursesList.length) {
            //remove duplicates
            coursesList.sort(function (a, b) {
                if (b.locator.value == a.locator.value)
                    return a.score - b.score;
                else return b.locator.value.localeCompare(a.locator.value);
            });
            var oldTitle = '';
            for (var k = coursesList.length - 1; k >= 0; k--) { //reverse loop
                var c = coursesList[k];
                if (c.locator.value == oldTitle) {
                    coursesList.splice(k, 1);
                } else oldTitle = c.locator.value;
            }

            //order for score
            coursesList.sort(function (a, b) {
                return b.score - a.score;
            });
        }
        callback(err, coursesList);
    });
};

