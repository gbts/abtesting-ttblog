'use strict';

const HEADER_KEY = 'x-abtesting-segment-origin';

// Origin Request handler
exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const headerValue = headers[HEADER_KEY] && headers[HEADER_KEY][0] && headers[HEADER_KEY][0].value;

    if (headerValue) {
        const segment = JSON.parse(headerValue);
        headers['host'] = [{ key: 'host', value: segment.host }];
        request.origin = segment.origin;
    }

    callback(null, request);
};
