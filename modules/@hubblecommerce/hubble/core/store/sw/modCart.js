import base64 from 'base-64';
import localStorageHelper from '@hubblecommerce/hubble/core/utils/localStorageHelper';

export default function (ctx) {
    const modCart = {
        namespaced: true,
        state: () => ({
            shippingCosts: 0,

            cart: {
                items_qty: 0,
                grand_total: 0,
                base_grand_total: 0,
                global_currency_code: 'EUR',
                subtotal: 0,
                coupons: [],
                base_subtotal: 0,
                subtotal_with_discount: 0,
                base_subtotal_with_discount: 0,
                items: [],
            },

            cookieName: 'hubbleCart',
            cookiePath: '/',
            cookieTTL: 720, // 720 hours = 30 days
            localStorageLifetime: 720, // 720 hours = 30 days

            // sw
            swtc: '',
            swtcCookieName: 'hubbleSwtc',

            productToUpdate: '',
            qtyToUpdate: null,
        }),
        getters: {
            getCookieExpires: state => {
                return new Date(new Date().getTime() + state.cookieTTL * 60 * 60 * 1000);
            },
            getCartEncoded: (state, getters) => objJsonStr => {
                return base64.encode(JSON.stringify(objJsonStr));
            },
            getCartDecoded: (state, getters) => objJsonB64 => {
                return JSON.parse(base64.decode(objJsonB64));
            },
            getSubtotals: state => {
                return state.cart.subtotal;
            },
            getShippingCosts: state => {
                return state.shippingCosts;
            },
            getTotals: state => {
                return state.cart.grand_total;
            },
            getSwtc: state => {
                return state.swtc;
            },
        },
        mutations: {
            setCartItemsCount: (state, qty) => {
                state.cart.items_qty = qty;
            },
            delCartItemObj: (state, item) => {
                _.pull(state.cart.items, item);
            },
            setCart: (state, item) => {
                state.cart = item;
            },
            setCartItemsObj: (state, items) => {
                state.cart.items = items;
            },
            setCartItemsObjQty: (state, payload) => {
                _.forEach(state.cart.items, (cartItem, key) => {
                    if (cartItem.id === payload.itemId) {
                        state.cart.items[key].qty = payload.itemQty;
                    }
                });

                // Save id and qty of item to update in store
                // then on modCart/updateItem call update lineItem width saved data to refresh cart
                state.productToUpdate = payload.itemId;
                state.qtyToUpdate = payload.itemQty;
            },
            setSubtotals: (state, item) => {
                state.cart.subtotal = item;
            },
            setShippingCosts: (state, item) => {
                state.shippingCosts = item;
            },
            setTotals: (state, item) => {
                state.cart.grand_total = item;
            },
            setSwtc: (state, item) => {
                state.swtc = item;
            },
        },
        actions: {
            clearAll({ commit, dispatch }) {
                return new Promise((resolve, reject) => {
                    // Reset cart object in store
                    commit('setCartItemsObj', []);
                    commit('setCartItemsCount', 0);

                    // Get cart from sw to calculate totals
                    dispatch('swGetCart').then(res => {
                        dispatch('saveCartToStorage', { response: res }).then(() => {
                            resolve('cart saved');
                        });
                    });
                });
            },
            swGetCart({ commit, state, dispatch, rootState, getters }) {
                return new Promise((resolve, reject) => {
                    dispatch(
                        'apiCall',
                        {
                            action: 'get',
                            tokenType: 'sw',
                            apiType: 'data',
                            swContext: state.swtc,
                            endpoint: '/sales-channel-api/v1/checkout/cart',
                        },
                        { root: true }
                    )
                        .then(response => {
                            resolve(response);
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            },
            recalculateCart({ dispatch }) {
                return new Promise((resolve, reject) => {
                    dispatch('swGetCart').then(response => {
                        dispatch('saveCartToStorage', { response: response }).then(() => {
                            resolve();
                        });
                    });
                });
            },
            initCart({ commit, state, dispatch, rootState, getters }) {
                return new Promise((resolve, reject) => {
                    dispatch(
                        'apiCall',
                        {
                            action: 'post',
                            tokenType: 'sw',
                            apiType: 'data',
                            endpoint: '/sales-channel-api/v1/checkout/cart',
                        },
                        { root: true }
                    )
                        .then(response => {
                            const token = response.data['sw-context-token'];

                            // Set swtc to store
                            commit('setSwtc', token);

                            // Save swtc to cookie
                            this.$cookies.set(state.swtcCookieName, token, {
                                path: state.cookiePath,
                                expires: getters.getCookieExpires,
                            });

                            resolve(token);
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            },
            saveSwtc({ commit, state, dispatch, rootState, getters }, payload) {
                return new Promise((resolve, reject) => {
                    // Set swtc to store
                    commit('setSwtc', payload);

                    // Save swtc to cookie
                    this.$cookies.set(state.swtcCookieName, payload, {
                        path: state.cookiePath,
                        expires: getters.getCookieExpires,
                    });

                    resolve();
                });
            },
            saveCartToStorage({ commit, state, dispatch, rootState, getters }, payload) {
                return new Promise((resolve, reject) => {
                    if (!_.isEmpty(payload.cart)) {
                        let cart = payload.cart;

                        if (payload.qty !== null) {
                            // Increase global cart counter
                            cart.items_qty = cart.items_qty + payload.qty;
                        }

                        // Refresh cart item before store to cookie
                        commit('setCart', cart);
                    }

                    // Refresh data in cart from shop response
                    let cartClone = _.cloneDeep(state.cart);
                    _.forEach(payload.response.data.data.lineItems, lineItem => {
                        _.forEach(cartClone.items, cartItem => {
                            if (cartItem.id === lineItem.id) {
                                cartItem.final_price_item.display_price_brutto = lineItem.price.unitPrice;
                            }
                        });
                    });
                    commit('setCart', cartClone);

                    dispatch('setTotals', payload.response).then(() => {
                        // Store cart with all info in local storage
                        localStorageHelper.setCreatedAt(_.clone(state.cart), state.localStorageLifetime).then(response => {
                            this.$localForage.setItem(state.cookieName, response);
                        });

                        // Store just important info in cookie
                        // We need cookie to verify on serverside middleware if items are in cart if user want to checkout
                        let smallCart = _.pick(state.cart, ['items_qty']);

                        // Encode Info
                        let _cart = getters.getCartEncoded(smallCart);

                        this.$cookies.set(state.cookieName, _cart, {
                            path: state.cookiePath,
                            expires: getters.getCookieExpires,
                        });

                        resolve();
                    });
                });
            },
            swAddtToCart({ commit, state, dispatch, rootState, getters }, payload) {
                const _endpoint = `/sales-channel-api/v1/checkout/cart/product/${payload.item.id}`;

                return new Promise((resolve, reject) => {
                    dispatch(
                        'apiCall',
                        {
                            action: 'post',
                            tokenType: 'sw',
                            apiType: 'data',
                            swContext: state.swtc,
                            endpoint: _endpoint,
                            data: {
                                qty: payload.qty,
                            },
                        },
                        { root: true }
                    )
                        .then(response => {
                            resolve(response);
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            },
            addToCart({ commit, state, dispatch, rootState, getters }, payload) {
                return new Promise((resolve, reject) => {
                    // Add current cart to order object temporarily
                    let cart = _.cloneDeep(state.cart);

                    // Add item to cloned cart
                    let item = _.pick(payload.item, [
                        'id',
                        'sku',
                        'name_orig',
                        'variants',
                        'image',
                        'manufacturer_name',
                        'final_price_item',
                        'url_pds',
                    ]);
                    let qty = payload.qty;
                    let isInCart = false;

                    // Assign selected qty to cart item in store
                    item = _.assign(item, { qty: qty });

                    // Check if item is already in cart
                    if (cart.items.length > 0) {
                        isInCart = _.find(cart.items, o => {
                            return o.id === item.id;
                        });
                    }

                    // Set item to cart if not exists
                    if (!isInCart) {
                        cart.items.push(item);

                        // Add to cart sw call
                        dispatch('swAddtToCart', { item: item, qty: qty }).then(res => {
                            dispatch('saveCartToStorage', { cart: cart, qty: qty, response: res }).then(() => {
                                resolve();
                            });
                        });
                    } else {
                        // Or just raise the qty of selected item
                        _.forEach(cart.items, (cartItem, key) => {
                            if (cartItem.id === item.id) {
                                cart.items[key].qty = parseInt(isInCart.qty) + qty;
                            }
                        });

                        // Add to cart sw call
                        dispatch('swAddtToCart', { item: item, qty: qty }).then(res => {
                            dispatch('saveCartToStorage', { cart: cart, qty: qty, response: res }).then(() => {
                                resolve();
                            });
                        });
                    }
                });
            },
            setTotals({ commit, state, dispatch, rootState, getters }, payload) {
                return new Promise((resolve, reject) => {
                    commit('setSubtotals', payload.data.data.price.positionPrice);

                    commit('setTotals', payload.data.data.price.totalPrice);

                    if (!_.isEmpty(payload.data.data.deliveries)) {
                        commit('setShippingCosts', payload.data.data.deliveries[0].shippingCosts.totalPrice);
                    } else {
                        commit('setShippingCosts', 0);
                    }

                    resolve();
                });
            },
            addItem({ commit, state, dispatch, rootState, getters }, payload) {
                return new Promise((resolve, reject) => {
                    // Check if swtc isset
                    if (state.swtc === '') {
                        // Init cart
                        dispatch('initCart').then(() => {
                            dispatch('addToCart', payload).then(() => {
                                resolve();
                            });
                        });
                    }

                    if (state.swtc !== '') {
                        dispatch('addToCart', payload).then(() => {
                            resolve();
                        });
                    }
                });
            },
            swUpdateLineItem({ commit, state, dispatch, rootState, getters }, payload) {
                const _endpoint = `/sales-channel-api/v1/checkout/cart/line-item/${payload.id}`;

                return new Promise((resolve, reject) => {
                    dispatch(
                        'apiCall',
                        {
                            action: 'patch',
                            tokenType: 'sw',
                            apiType: 'data',
                            swContext: state.swtc,
                            endpoint: _endpoint,
                            data: {
                                quantity: payload.qty,
                            },
                        },
                        { root: true }
                    )
                        .then(response => {
                            resolve(response);
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            },
            updateItem({ commit, state, dispatch }, payload) {
                return new Promise(resolve => {
                    // Update global cart counter
                    commit('setCartItemsCount', state.cart.items_qty + payload.qty);

                    dispatch('swUpdateLineItem', { id: state.productToUpdate, qty: state.qtyToUpdate }).then(res => {
                        dispatch('saveCartToStorage', { response: res }).then(() => {
                            resolve('item updated');
                        });
                    });
                });
            },
            swRemoveLineItem({ commit, state, dispatch, rootState, getters }, payload) {
                const _endpoint = `/sales-channel-api/v1/checkout/cart/line-item/${payload.id}`;

                return new Promise((resolve, reject) => {
                    dispatch(
                        'apiCall',
                        {
                            action: 'delete',
                            tokenType: 'sw',
                            apiType: 'data',
                            swContext: state.swtc,
                            endpoint: _endpoint,
                        },
                        { root: true }
                    )
                        .then(response => {
                            resolve(response);
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            },
            delItem({ commit, state, getters, dispatch }, payload) {
                let item = payload.data;

                return new Promise((resolve, reject) => {
                    commit('delCartItemObj', item);
                    commit('setCartItemsCount', state.cart.items_qty - item.qty);

                    dispatch('swRemoveLineItem', { id: item.id }).then(res => {
                        dispatch('saveCartToStorage', { response: res }).then(() => {
                            resolve('item updated');
                        });
                    });
                });
            },
            setSwtcByCookie({ commit, state, getters, dispatch }, payload) {
                return new Promise(resolve => {
                    // try to retrieve auth user by cookie
                    let _cookie = this.$cookies.get(state.swtcCookieName);

                    // no cookie? ok!
                    if (_cookie == null) {
                        resolve({
                            success: true,
                            message: 'swtc not known by cookie.',
                        });
                    } else {
                        commit('setSwtc', _cookie);

                        // set/send cookie to enforce lifetime
                        this.$cookies.set(state.swtcCookieName, _cookie, {
                            path: state.cookiePath,
                            expires: getters.getCookieExpires,
                        });

                        resolve({
                            success: true,
                            message: 'swtc taken from cookie.',
                            redirect: true,
                        });
                    }
                });
            },
            setByCookie({ commit, state, getters, dispatch }, payload) {
                return new Promise(resolve => {
                    // try to retrieve auth user by cookie
                    let _cookie = this.$cookies.get(state.cookieName);

                    // no cookie? ok!
                    if (!_cookie) {
                        resolve({
                            success: true,
                            message: 'cart not known by cookie.',
                        });
                    }

                    let _item = getters.getCartDecoded(_cookie);

                    commit('setCart', _item);

                    // set/send cookie to enforce lifetime
                    this.$cookies.set(state.cookieName, getters.getCartEncoded(_item), {
                        path: state.cookiePath,
                        expires: getters.getCookieExpires,
                    });

                    resolve({
                        success: true,
                        message: 'cart taken from cookie.',
                        redirect: true,
                    });
                });
            },
            setByForage({ commit, state }) {
                return new Promise(resolve => {
                    this.$localForage.getItem(state.cookieName).then(response => {
                        // Remove local storage if its invalid (end of lifetime)
                        if (!localStorageHelper.lifeTimeIsValid(response, state.localStorageLifetime)) {
                            this.$localForage.removeItem(state.cookieName);
                            resolve({
                                success: true,
                                message: 'local storage was cleared for its invalidity',
                                redirect: true,
                            });
                        }

                        if (response !== null) {
                            commit('setCart', response);
                            resolve({
                                success: true,
                                message: 'cart taken from forage.',
                                redirect: true,
                            });
                        }

                        resolve({
                            success: true,
                            message: 'cart not known by forage.',
                        });
                    });
                });
            },
            async calculateShippingCosts({ state, commit, dispatch }, payload) {
                return new Promise((resolve, reject) => {
                    resolve();
                });
            },
            async precalculateShippingCost({ commit, dispatch }, payload) {
                return true;
            },
        },
    };

    // Register vuex store module
    ctx.store.registerModule('modCart', modCart);
}
