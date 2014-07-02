/*
 * Merge two or more objects.
 * i.e. var out = mergeObj(in1, in2, ...);
 *
 * Object attributes are merged too.
 * Primitive types values are overwritten by the last one.
 */
exports.mergeObj = function () {
    var mObj = {};
    for (var o in arguments) {
        if (arguments.hasOwnProperty(o)) {
            var obj = arguments[o];
            for (var attrname in obj) {
                if (obj.hasOwnProperty(attrname)) {
                    mObj[attrname] = obj[attrname];
                }
            }
        }
    }
    return mObj;
};
