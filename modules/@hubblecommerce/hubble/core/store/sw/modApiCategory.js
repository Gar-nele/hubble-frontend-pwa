import { slugify } from '@hubblecommerce/hubble/core/utils/menuHelper';

export default function (ctx) {
    const modApiCategory = {
        namespaced: true,
        state: () => ({
            dataCategory: {},
            dataCategoryProducts: {},
            apiRequestBody: {
                limit: process.env.limiter_default,
                page: 1,
                filter: [
                    {
                        type: 'equals',
                        field: 'active',
                        value: true,
                    },
                    {
                        type: 'range',
                        field: 'stock',
                        parameters: {
                            gt: 0,
                        },
                    },
                ],
                sort: [
                    {
                        field: 'price',
                        direction: 'asc',
                    },
                ],
                associations: {
                    manufacturer: {},
                    media: {},
                    cover: {},
                },
            },
        }),
        mutations: {
            setDataCategory: (state, payload) => {
                state.dataCategory = payload.data;
            },
            setDataCategoryProducts: (state, payload) => {
                state.dataCategoryProducts = payload.data;
            },
            setFilter: (state, payload) => {
                _.remove(state.apiRequestBody.filter, function (o) {
                    // remove by field
                    return o.field === payload.field;
                });
                state.apiRequestBody.filter.push(payload);
            },
            resetFilter: state => {
                state.apiRequestBody.filter = [
                    {
                        type: 'equals',
                        field: 'active',
                        value: true,
                    },
                    {
                        type: 'range',
                        field: 'stock',
                        parameters: {
                            gt: 0,
                        },
                    },
                ];
            },
            setLimit: (state, payload) => {
                state.apiRequestBody.limit = payload;
            },
            setPage: (state, payload) => {
                state.apiRequestBody.page = payload;
            },
            setTerm: (state, payload) => {
                state.apiRequestBody.term = payload;
            },
            setFilters: (state, query) => {
                // Reset all filters
                state.apiRequestBody.filter = [];

                const paramBlackList = ['term', 'page', 'limit', 'sort', 'manufacturer', 'price_from', 'price_to'];

                // Iterate all query params
                _.forEach(query, (val, param) => {
                    // Only proceed if parameter is not blacklisted apply only filter parameters (pagination, limiter, etc...)
                    if (!paramBlackList.includes(param)) {
                        // Build filter object
                        // Turn comma seperated parameter values to array
                        let filter = {
                            type: 'multi',
                            operator: 'OR',
                            queries: [
                                {
                                    type: 'equalsAny',
                                    field: 'propertyIds',
                                    value: val.split(','),
                                },
                                {
                                    type: 'equalsAny',
                                    field: 'optionIds',
                                    value: val.split(','),
                                },
                            ],
                        };

                        // Set filterobject to request body
                        state.apiRequestBody.filter.push(filter);
                    }

                    // Special entity manufacturer
                    if (param === 'manufacturer') {
                        let filter = {
                            type: 'equalsAny',
                            field: 'manufacturerId',
                            value: val.split(','),
                        };

                        state.apiRequestBody.filter.push(filter);
                    }
                });

                // Special entity price_to
                let priceRangeFilter = {
                    type: 'range',
                    field: 'price',
                    parameters: {},
                };

                if (query['price_from'] != null) {
                    priceRangeFilter.parameters.gte = query['price_from'];
                }

                if (query['price_to'] != null) {
                    priceRangeFilter.parameters.lte = query['price_to'];
                }

                if (query['price_from'] != null || query['price_to'] != null) {
                    state.apiRequestBody.filter.push(priceRangeFilter);
                }
            },
            setSorting: (state, payload) => {
                let sort = _.find(process.env.sorter, { option_id: parseInt(payload) });
                let direction;

                if (sort.direction === 'asc') {
                    direction = '';
                }

                if (sort.direction === 'desc') {
                    direction = '-';
                }

                state.apiRequestBody.sort = direction + sort.order;
            },
        },
        getters: {
            getDataCategory: state => {
                return state.dataCategory;
            },
            getDataCategoryProducts: state => {
                return state.dataCategoryProducts;
            },
        },
        actions: {
            async swGetCategory({ commit, state, dispatch }, payload) {
                return new Promise(function (resolve, reject) {
                    let _endpoint = '/sales-channel-api/v1/category/' + payload + '?associations[media][]';

                    dispatch(
                        'apiCall',
                        {
                            action: 'get',
                            tokenType: 'sw',
                            apiType: 'data',
                            endpoint: _endpoint,
                        },
                        { root: true }
                    )
                        .then(response => {
                            dispatch('mappingCategory', response.data.data).then(res => {
                                commit('setDataCategory', {
                                    data: {
                                        result: {
                                            item: res,
                                        },
                                    },
                                });
                            });

                            resolve('OK');
                        })
                        .catch(response => {
                            console.log('API get request failed: %o', response);

                            reject('API request failed!');
                        });
                });
            },
            async swGetProducts({ commit, state, dispatch, rootState }) {
                return new Promise(function (resolve, reject) {
                    let _endpoint = '/sales-channel-api/v1/product';

                    dispatch(
                        'apiCall',
                        {
                            action: 'post',
                            tokenType: 'sw',
                            apiType: 'data',
                            endpoint: _endpoint,
                            data: state.apiRequestBody,
                        },
                        { root: true }
                    )
                        .then(response => {
                            // If no products for this category set empty array as category products
                            if (response.data.total === 0) {
                                commit('setDataCategoryProducts', {
                                    data: {
                                        result: [],
                                    },
                                });

                                resolve();
                            }

                            dispatch('mappingCategoryProducts', response.data).then(res => {
                                // Get all product urls to find urls of search result products
                                dispatch('modApiResources/swGetProductUrls', {}, { root: true }).then(() => {
                                    _.forEach(res.items, (item, key) => {
                                        let matchingProduct = _.find(rootState.modApiResources.dataProductUrls, function (o) {
                                            return o.foreignKey === item.id;
                                        });

                                        // Set urls of matches
                                        res.items[key].url_pds = matchingProduct.seoPathInfo;

                                        commit('setDataCategoryProducts', {
                                            data: {
                                                result: res,
                                            },
                                        });

                                        resolve();
                                    });
                                });
                            });
                        })
                        .catch(response => {
                            console.log('API get request failed: %o', response);
                            reject('API request failed!');
                        });
                });
            },
            async mappingCategory({ commit, state, dispatch }, payload) {
                return new Promise(function (resolve, reject) {
                    // MAPPING
                    let obj = {};

                    // Map required properties from sw response to hubble requirements
                    obj.id = payload.id;
                    obj.name = payload.name;

                    if (payload.media !== null) {
                        obj.image = payload.media.url;
                    }

                    obj.description = null;
                    obj.teaser = payload.description;
                    obj.meta_title = payload.metaTitle;
                    obj.meta_keywords = payload.keywords;
                    obj.meta_description = payload.metaDescription;
                    obj.level = payload.level;
                    obj.path_ids = payload.path.split('|').filter(s => s);
                    obj.path_names = payload.breadcrumb;
                    obj.path_urls = [];
                    _.each(payload.breadcrumb, crumb => {
                        obj.path_urls.push(slugify(crumb));
                    });

                    resolve(obj);
                });
            },
            async mappingCategoryProducts({ commit, state, dispatch }, payload) {
                return new Promise(function (resolve, reject) {
                    // MAPPING
                    let mapped = [];
                    _.forEach(payload.data, product => {
                        let obj = {};

                        obj.id = product.id;
                        obj.ean = product.ean;
                        obj.type = product.sw;
                        if (product.cover !== null) {
                            obj.image = product.cover.media.url;
                        }
                        obj.name = product.name;
                        obj.description = product.description;
                        obj.meta_title = product.metaTitle;
                        obj.meta_keywords = product.keywords;
                        obj.meta_description = product.metaDescription;
                        if (product.manufacturer !== null) {
                            obj.manufacturer_id = product.manufacturer.id;
                            obj.manufacturer_name = product.manufacturer.name;
                        }
                        if (product.seoUrls !== null) {
                            _.forEach(product.seoUrls, seoUrl => {
                                if (seoUrl.isCanonical) {
                                    obj.url_pds = seoUrl.seoPathInfo;
                                }
                            });
                        }
                        obj.stock_item = {
                            qty: product.stock,
                            is_in_stock: product.available,
                        };
                        obj.final_price_item = {
                            special_to_date: null,
                            special_from_date: null,
                            display_price_netto: product.price[0].net,
                            display_price_netto_special: null,
                            display_price_brutto: product.price[0].gross,
                            display_price_brutto_special: null,
                            priceinfo: null,
                            tax_class_id: 1,
                        };

                        mapped.push(obj);
                    });

                    let totalItems = 0;
                    if (payload.total > 0) {
                        totalItems = payload.total;
                    }
                    let obj = {
                        items: mapped,
                        stats: {
                            total: totalItems,
                        },
                    };

                    resolve(obj);
                });
            },
            async swGetCategoryProductsById({ commit, state, dispatch }, payload) {
                return new Promise(function (resolve, reject) {
                    let _endpoint =
                        '/sales-channel-api/v1/category/' +
                        payload.id +
                        '?associations[products][associations][seoUrls][]' +
                        '&associations[products][associations][manufacturer][]' +
                        '&associations[products][associations][options][]' +
                        '&associations[products][associations][cover][]' +
                        '&associations[media][]';

                    dispatch(
                        'apiCall',
                        {
                            action: 'get',
                            tokenType: 'sw',
                            apiType: 'data',
                            endpoint: _endpoint,
                        },
                        { root: true }
                    )
                        .then(response => {
                            dispatch('mappingCategoryProducts', { data: response.data.data.products }).then(res => {
                                resolve({
                                    data: {
                                        result: res,
                                    },
                                });
                            });
                        })
                        .catch(response => {
                            console.log('API get request failed: %o', response);
                            reject('API request failed!');
                        });
                });
            },
            async setApiRequestFilter({ commit, state, dispatch }, payload) {
                return new Promise(function (resolve, reject) {
                    commit('setFilter', payload);
                    resolve();
                });
            },
        },
    };

    ctx.store.registerModule('modApiCategory', modApiCategory);
}
