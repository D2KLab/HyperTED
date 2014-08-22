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
    var regex = "";
    keywords.forEach(function (k) {
        regex += "(" + k + ")"
    });

    openUniversity.query('SELECT DISTINCT ?course ?description ?title ?subject ?locator ' +
            ' FROM <http://data.open.ac.uk/context/openlearn>  ' +
            'where {    ' +
            '?course purl:description ?description.   ' +
            ' ?course purl:title ?title.    ' +
//            '?course purl:subject ?subject.    ' +
            '?course w3-ont:locator ?locator.   ' +
            '?course a <http://data.open.ac.uk/openlearn/ontology/OpenLearnUnit>   ' +
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

            var coursesList = data.results.bindings;
            if (!coursesList || !coursesList.length) {
                callback(err);
                return;
            }

            // score: first the courses with more matches
            var rg = new RegExp(regex, 'gi');
            coursesList.forEach(function (c) {
                var s = c.title.value + c.description.value;
                c.score = s.match(rg).length;
            });

            callback(err, coursesList);
        }
    );
}

function getFromOpenCourseWare(keywords, callback) {
    // keywords: array to regex
    var regex = "";
    keywords.forEach(function (k) {
        regex += "(" + k + ")"
    });

    openCourseWare.query('select DISTINCT  ?course ?title ?subject ?description ?url ' +
            'where {' +
            ' 	?course a linkedu:OpenEducationalResource.' +
            ' 	?course purl:title ?title.' +
            ' 	?course purl:description ?description.' +
//            ' 	?course purl:subject ?subject.' +
            ' 	?course dbpedia:url ?url.' +
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

            var coursesList = data.results.bindings;
            if (!coursesList || !coursesList.length) {
                callback(err);
                return;
            }

            // scrore: first the courses with more matches
            var rg = new RegExp(regex, 'gi');
            coursesList.forEach(function (c) {
                var s = c.title.value + c.description.value;
                c.score = s.match(rg).length;
            });

            callback(err, coursesList);
        }
    );
}

exports.getSuggestedCouses = function (keyword, callback) {
    if (!keywords instanceof Array || !keywords.length) {
        callback(Error('Keywords Parameter must be an array with at least 1 strings'));
        return;
    }

    var coursesList = [];
    async.parallel([
        function (async_callback) {
            getFromOpenUniversity(keyword, function (err, data) {
                if (err) console.error(err);
                if (data && data.length) coursesList = coursesList.concat(data);
                async_callback();
            });
        },
        function (async_callback) {
            getFromOpenCourseWare(keyword, function (err, data) {
                if (err) console.error(err);
                if (data && data.length) coursesList = coursesList.concat(data);
                async_callback();
            });

        }
    ], function (err) {
        if (coursesList.length) {
            coursesList.sort(function (a, b) {
                return b.score - a.score;
            });
        }
        callback(err, coursesList);
    });
};

