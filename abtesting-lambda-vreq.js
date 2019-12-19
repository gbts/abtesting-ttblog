'use strict';

const COOKIE_KEY = 'ABTesting-SegmentID';
const NUM_SEGMENTS = 100;

const getRandomId = () => Math.floor(Math.random() * (1 + NUM_SEGMENTS));

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

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const headerCookie = getCookie(headers, COOKIE_KEY);
    if (headerCookie != null) {
        callback(null, request);
        return;
    }

    const segmentId = getRandomId();
    console.log(`segmentId: ${segmentId}`)

    const cookie = `${COOKIE_KEY}=${segmentId}`
    console.log(`setting cookie: ${cookie}`);
    headers.cookie = headers.cookie || [];
    headers.cookie.push({ key: 'Cookie', value: cookie });

    callback(null, request);
};
