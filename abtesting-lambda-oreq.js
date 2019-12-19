'use strict';

const aws = require('aws-sdk');

const COOKIE_KEY = 'ABTesting-SegmentID';
const NUM_SEGMENTS = 100;

const s3 = new aws.S3({ region: 'eu-west-1' });
const s3Params = {
    Bucket: 'abtesting-ttblog-map',
    Key: 'map.json',
};
const SEGMENT_MAP_TTL = 300000; // TTL of 5 minutes in ms

const fetchSegmentMapFromS3 = async() => {
    const response = await s3.getObject(s3Params).promise();
    return JSON.parse(response.Body.toString('utf-8'));
}

// Cache the segment map across Lambda invocations
let _segmentMap;
let _lastFetchedSegmentMap = 0;
const fetchSegmentMap = async() => {
    if (!_segmentMap || (Date.now() - _lastFetchedSegmentMap) > SEGMENT_MAP_TTL) {
        _segmentMap = await fetchSegmentMapFromS3();
        _lastFetchedSegmentMap = Date.now();
    }

    return _segmentMap;
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

const getSegmentId = (headers) => {
    const cookieVal = getCookie(headers, COOKIE_KEY);
    if (cookieVal != null) {
        return parseInt(cookieVal);
    }
    console.error('No segmentId cookie found!');
    return -1;
}

const getSegmentGroup = async(segmentId) => {
    const segmentMap = await fetchSegmentMap();
    for (let group of segmentMap.segmentGroups) {
        if (segmentId >= group.range[0] && segmentId <= group.range[1]) {
            return group;
        }
    }
    console.error(`No origin for segment id ${segmentId}. Check the segment map.`);
}

// Origin Request handler
exports.handler = async(event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const segmentId = getSegmentId(headers);

    if (segmentId != -1) {
        const segmentGroup = await getSegmentGroup(segmentId);
        headers['host'] = [{ key: 'host', value: segmentGroup.host }];
        request.origin = segmentGroup.origin;
    }

    callback(null, request);
};
