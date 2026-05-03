"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseURI = void 0;
const parseURI = (req, res, next) => {
    var err = null;
    try {
        decodeURIComponent(req.path);
    }
    catch (e) {
        err = e;
    }
    if (err) {
        return res.redirect('/');
    }
    next();
};
exports.parseURI = parseURI;
