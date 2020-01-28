'use strict';

const aws = require('aws-sdk');

const COOKIE_KEY = 'abtesting-unique-id';

const s3 = new aws.S3({ region: 'eu-west-1' });
const s3Params = {
    Bucket: 'abtesting-ttblog-map',
    Key: 'map.json',
};
const SEGMENT_MAP_TTL = 3600000; // TTL of 1 hour

const fetchSegmentMapFromS3 = async () => {
    const response = await s3.getObject(s3Params).promise();
    return JSON.parse(response.Body.toString('utf-8'));
}

// Cache the segment map across Lambda invocations
let _segmentMap;
let _lastFetchedSegmentMap = 0;
const fetchSegmentMap = async () => {
    if (!_segmentMap || (Date.now() - _lastFetchedSegmentMap) > SEGMENT_MAP_TTL) {
        _segmentMap = await fetchSegmentMapFromS3();
        _lastFetchedSegmentMap = Date.now();
    }

    return _segmentMap;
}

// Just generate a random UUID
const getRandomId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// This function will hash any string (our random UUID in this case) down
// to a [0, 1) range
const hashToInterval = (s) => {
    let hash = 0,
        i = 0;

    while (i < s.length) {
        hash = ((hash << 5) - hash + s.charCodeAt(i++)) << 0;
    }
    return (hash + 2147483647) % 100 / 100;
}

const getCookie = (headers, cookieKey) => {
    if (headers.cookie) {
        for (let cookieHeader of headers.cookie) {
            const cookies = cookieHeader.value.split(';');
            for (let cookie of cookies) {
                const [key, val] = cookie.split('=');
                if (key === cookieKey) {
                    return val;
                }
            }
        }
    }
    return null;
}

const getSegment = async (p) => {
    const segmentMap = await fetchSegmentMap();
    let weight = 0;
    for (const segment of segmentMap.segments) {
        weight += segment.weight;
        if (p < weight) {
            return segment;
        }
    }
    console.error(`No segment for value ${p}. Check the segment map.`);
}

exports.handler = async (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    let uniqueId = getCookie(headers, COOKIE_KEY);
    if (uniqueId === null) {
        // This is what happens on the first visit: we'll generate a new
        // unique ID, then leave it the cookie header for the viewer response
        // lambda to set permanently later
        uniqueId = getRandomId();
        const cookie = `${COOKIE_KEY}=${uniqueId}`;
        headers.cookie = headers.cookie || [];
        headers.cookie.push({ key: 'Cookie', value: cookie });
    }

    // Get a value between 0 and 1 and use it to resolve the traffic segment
    const p = hashToInterval(uniqueId);
    const segment = await (getSegment(p));

    // Pass the origin data as a header to the origin request lambda
    // The header key below is whitelisted in Cloudfront
    const headerValue = JSON.stringify({
        host: segment.host,
        origin: segment.origin
    });
    headers['x-abtesting-segment-origin'] = [{ key: 'X-ABTesting-Segment-Origin', value: headerValue }];

    callback(null, request);
};
