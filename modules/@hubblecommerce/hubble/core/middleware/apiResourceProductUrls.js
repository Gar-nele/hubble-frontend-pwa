import { datetimeUnixNow } from '@hubblecommerce/hubble/core/utils/datetime';
import Middleware from './middleware';

Middleware.apiResourceProductUrls = function ({ isHMR, store, error }) {
    // ignore if called from hot module replacement
    if (isHMR) {
        return;
    }

    if (process.env.API_TYPE !== 'sw') {
        return;
    }

    let _dataProductUrls = store.getters['modApiResources/getDataProductUrls'];

    // check vuex store object first (not empty and same locale)
    if (!_.isEmpty(_dataProductUrls)) {
        // check expiry of cachable object
        if (_dataProductUrls.expires_at_unixtime >= datetimeUnixNow()) {
            return;
        }
    }

    return new Promise((resolve, reject) => {
        store
            .dispatch(`modApiResources/${process.env.API_TYPE}GetProductUrls`, {})
            .then(response => {
                resolve(response);
            })
            .catch(response => {
                error({ statusCode: 401, message: 'API authentication failed' });
                reject(response);
            });
    });
};
