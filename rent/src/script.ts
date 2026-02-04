declare const Ecwid: any;
declare const ec: any;
declare let rosettaMessages: Record<string, any>;

type TimeField = "drop_off" | "pick_up";

interface TimeEntry {
    hour: number;
    minute: number;
    string: string;
}
const RENT_PRODUCT_ID = 814006503;

const createRentWidget = () => {
    const state: {
        days: number;
        dates: string | null;
        time: Record<TimeField, TimeEntry>;
        datesArray: Date[] | null;
    } = {
        days: 1,
        dates: null,
        time: {
            drop_off: { hour: 12, minute: 0, string: "" },
            pick_up: { hour: 12, minute: 0, string: "" }
        },
        datesArray: null
    };

    function toggleCheckoutEnabled(enabled: boolean): void {
        const checkoutBtn = document.querySelector(`.ec-cart__button--checkout`);
        if (!checkoutBtn) {
            return;
        }
        if (!!enabled) {
            checkoutBtn.classList.remove(`form-control--disabled`);
        } else {
            checkoutBtn.classList.add(`form-control--disabled`);
        }
    }

    function toggleLoadingClass(loading: boolean): void {
        const checkoutBtn = document.querySelector(`.ec-cart__button--checkout`);
        if (!checkoutBtn) {
            return;
        }
        if (!!loading) {
            checkoutBtn.classList.add(`form-control--loading`);
            checkoutBtn.classList.add(`form-control--disabled`);
        } else {
            checkoutBtn.classList.remove(`form-control--loading`);
            checkoutBtn.classList.remove(`form-control--disabled`);
        }
    }

    function saveToExtraField(val: string): void {
        ec.order = ec.order || {};
        ec.order.extraFields = ec.order.extraFields || {};
        ec.order.extraFields.rent_dates = {
            type: "hidden",
            title: "Rent dates",
            value: val,
            orderDetailsDisplaySection: "order_comments"
        };
    }

    let isCartUpdating = false;

    function getDaysBetween(date1?: Date, date2?: Date): number | null {
        if (!date1 || !date2) {
            return null;
        }
        try {
            const oneDay = 1000 * 60 * 60 * 24;
            const date1Ms = date1.getTime();
            const date2Ms = date2.getTime();
            const differenceMs = date2Ms - date1Ms;
            return Math.ceil(differenceMs / oneDay);
        } catch (_err) {
            return null;
        }
    }

    function updateCartQuantity(targetQty: number): void {
        toggleLoadingClass(true);
        toggleCheckoutEnabled(false);
        isCartUpdating = true;

        Ecwid.Cart.get((cart: any) => {
            const items = cart?.items || [];

            // Отбираем продукты для обработки (кроме исключаемого), идём с конца,
            // чтобы removeProduct по индексам оставался корректным.
            const tasks = items
                .map((item: any, idx: number) => ({ item, idx }))
                .filter(({ item }) => {
                    const id = item?.product?.id ?? item?.id;
                    return id !== RENT_PRODUCT_ID;
                })
                .sort((a, b) => b.idx - a.idx);

            const finalize = () => {
                toggleLoadingClass(false);
                toggleCheckoutEnabled(true);
            };

            if (tasks.length === 0) {
                isCartUpdating = false;
                finalize();
                return;
            }

            const processNext = (pos: number) => {
                if (pos >= tasks.length) {
                    isCartUpdating = false;
                    finalize();
                    return;
                }

                const { item, idx } = tasks[pos];
                const id = item?.product?.id ?? item?.id;
                const options = item?.selectedOptions || item?.options || {};
                const currentQty = item?.quantity ?? 0;
                const delta = targetQty - currentQty;

                if (delta === 0) {
                    processNext(pos + 1);
                    return;
                }

                if (delta < 0) {
                    decreaseProductToTarget(idx, id, targetQty, options, () => processNext(pos + 1));
                    return;
                }

                increaseProductByDelta(id, delta, options, () => processNext(pos + 1));
            };

            processNext(0);
        });
    }

    function decreaseProductToTarget(
        idx: number,
        id: number,
        targetQty: number,
        options: Record<string, any>,
        done: () => void
    ): void {
        Ecwid.Cart.removeProduct(idx, () => {
            Ecwid.Cart.addProduct({ id, quantity: targetQty, options }, done);
        });
    }

    function increaseProductByDelta(
        id: number,
        delta: number,
        options: Record<string, any>,
        done: () => void
    ): void {
        Ecwid.Cart.addProduct({ id, quantity: delta, options }, done);
    }

    function syncCartGuard(): void {
        if (isCartUpdating) {
            return;
        }
        Ecwid.Cart.get((cart: any) => {
            const items = cart?.items || [];
            if (items.length === 0) return;

            const hasRentProduct = items.some((item: any) => {
                const id = item?.product?.id ?? item?.id;
                return id === RENT_PRODUCT_ID;
            });

            // Если остался только наш rent‑товар — очищаем корзину.
            if (items.length === 1 && hasRentProduct) {
                isCartUpdating = true;
                toggleLoadingClass(true);
                toggleCheckoutEnabled(false);
                Ecwid.Cart.clear(() => {
                    // Перезагружаем страницу, чтобы избежать багов рендера после очистки.
                    window.location.reload();
                });
                return;
            }

            // Если rent‑товара нет, но корзина не пуста — добавляем его.
            if (!hasRentProduct) {
                isCartUpdating = true;
                toggleLoadingClass(true);
                toggleCheckoutEnabled(false);

                Ecwid.Cart.addProduct({ id: RENT_PRODUCT_ID, quantity: 1, options: { Quantity: "1" } }, () => {
                    isCartUpdating = false;
                    toggleLoadingClass(false);
                    toggleCheckoutEnabled(true);
                });
            }
        });
    }

    function createTimePickers(): void {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`.cstmz-time-picker input`));
        inputs.forEach((input, index) => {
            const field: TimeField = index === 0 ? `drop_off` : `pick_up`;
            const name = index === 0 ? `Drop Off` : `Pick Up`;

            (input as any).flatpickr({
                enableTime: true,
                noCalendar: true,
                defaultHour: state.time[field].hour,
                defaultMinute: state.time[field].minute,
                onChange: (_selectedDates: Date[], dateStr: string) => {
                    ec.order = ec.order || {};
                    ec.order.extraFields = ec.order.extraFields || {};
                    ec.order.extraFields[`time_${field}`] = {
                        type: "hidden",
                        title: `Requested ${name} Time`,
                        value: dateStr,
                        orderDetailsDisplaySection: "order_comments"
                    };
                    const [hourStr = "0", minuteStr = "0"] = dateStr.split(":", 2);
                    state.time[field].hour = parseInt(hourStr, 10);
                    state.time[field].minute = parseInt(minuteStr, 10);
                    state.time[field].string = dateStr;
                }
            });
        });
    }

    function createDatePicker(field: HTMLInputElement): void {
        toggleCheckoutEnabled(false);

        (field as any).flatpickr({
            mode: "range",
            minDate: new Date(),
            defaultDate: state.datesArray || undefined,
            dateFormat: "d/m/Y",
            onChange: (selectedDates: Date[], dateStr: string) => {
                field.value = dateStr;
                state.dates = dateStr;
                state.datesArray = selectedDates;

                const qty = getDaysBetween(selectedDates[0], selectedDates[1]);
                if (qty !== null) {
                    state.days = qty;
                    updateCartQuantity(qty);
                } else {
                    toggleCheckoutEnabled(false);
                }
                field.dispatchEvent(new Event(`input`));
                saveToExtraField(dateStr);
            },
            onReady: () => {
                if (state.datesArray !== null) {
                    const qty = getDaysBetween(state.datesArray[0], state.datesArray[1]);
                    if (qty !== null) {
                        state.days = qty;
                        updateCartQuantity(qty);
                    } else {
                        toggleCheckoutEnabled(false);
                    }
                    field.dispatchEvent(new Event(`input`));
                }
            }
        });

        if (state.dates !== null) {
            field.value = state.dates;
            field.dispatchEvent(new Event(`input`));
            toggleCheckoutEnabled(true);
        }
    }

    function loadAssets(): void {
        const script = document.createElement(`script`);
        script.type = `text/javascript`;
        script.src = `https://cdn.jsdelivr.net/npm/flatpickr`;
        document.querySelector(`body`)?.appendChild(script);

        const styles = document.createElement(`link`);
        styles.rel = `stylesheet`;
        styles.href = `https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css`;
        document.querySelector(`head`)?.appendChild(styles);
    }

    function createCustomField(): void {
        const exists = document.querySelector(`.cstmz-picker`);
        const parent = document.querySelector(`.ec-cart-email`);
        if (exists !== null && exists.parentNode) {
            exists.parentNode.removeChild(exists);
        }
        if (!parent) {
            return;
        }

        const block = document.createElement(`div`);
        block.className = `cstmz-picker`;
        block.innerHTML = `<div class='cstmz-picker__inner'>
                            <div class="cstmz-picker__title">Rental dates</div>
                            <div class="form-control">
                                <input class="form-control__text" type="text">
                                <div class="form-control__placeholder">
                                    <div class="form-control__placeholder-inner"></div>
                                </div>
                            </div>
                            <div class='cstmz-pickers__time'>
                                
                                <div class='cstmz-time-picker from-picker'>
                                    <div class="cstmz-picker__title">Requested Drop Off Time</div>
                                    <div class="form-control">
                                    <input class="form-control__text" type="text">
                                    <div class="form-control__placeholder">
                                        <div class="form-control__placeholder-inner"></div>
                                    </div>
                                    </div>
                                </div>
                                
                                <div class='cstmz-time-picker to-picker'>
                                    <div class="cstmz-picker__title">Requested Pick Up Time</div>
                                    <div class="form-control">
                                    <input class="form-control__text" type="text">
                                    <div class="form-control__placeholder">
                                        <div class="form-control__placeholder-inner"></div>
                                    </div>
                                    </div>
                                </div>
                            
                            </div>
                            </div>`;
        parent.appendChild(block);

        const dateInput = block.querySelector<HTMLInputElement>(`input`);
        if (dateInput) {
            createDatePicker(dateInput);
        }
        createTimePickers();

        try {
            const fromInput = document.querySelector<HTMLInputElement>(`.from-picker input`);
            const toInput = document.querySelector<HTMLInputElement>(`.to-picker input`);

            if (fromInput) {
                fromInput.value = state.time["drop_off"].string;
                fromInput.dispatchEvent(new Event("input"));
            }
            if (toInput) {
                toInput.value = state.time["pick_up"].string;
                toInput.dispatchEvent(new Event("input"));
            }
        } catch (err) {
            console.log(err);
        }
    }

    function setRosettaDays(): void {
        rosettaMessages = rosettaMessages || {};
        rosettaMessages["storefront"] = rosettaMessages["storefront"] || {};
        rosettaMessages["storefront"]["CartPage.ItemsCount.few"] = "{count} days";
        rosettaMessages["storefront"]["CartPage.ItemsCount.one"] = "{count} days";
        rosettaMessages["storefront"]["CartPage.ItemsCount.plural"] = "{count} days";
        rosettaMessages["storefront"]["CartPage.ItemsCount.singular"] = "1 day";
    }

    function recountDays(): void {
        const label = document.querySelector<HTMLElement>(`.ec-cart-item-sum__count-label`);
        const mobileLabel = document.querySelector<HTMLElement>(`.ec-cart-item-sum--items .form-control__select-text`);
        if (label !== null) {
            label.textContent = state.days !== 1 ? `${state.days} days` : `${state.days} day`;
        } else if (mobileLabel !== null) {
            mobileLabel.textContent = state.days !== 1 ? `${state.days} days` : `${state.days} day`;
        }
    }

    function appendDays(): void {
        ec.order = ec.order || {};
        ec.order.extraFields = ec.order.extraFields || {};
        const days = ec.order.extraFields.rent_dates || null;
        const emailBlock = document.querySelector(`.ec-cart-step--email .ec-cart-step__wrap`);
        const exists = document.querySelector(`.cstmz-days`);
        if (emailBlock !== null && days !== null && exists === null) {
            const daysBlock = document.createElement(`div`);
            daysBlock.className = `cstmz-days`;
            daysBlock.innerHTML = `Rent days: ${days["value"]}`;
            emailBlock.appendChild(daysBlock);
        }
    }

    return {
        loadAssets,
        createCustomField,
        setRosettaDays,
        recountDays,
        appendDays,
        syncCartGuard
    };
};

    Ecwid.OnAPILoaded.add(() => {
        const {
            loadAssets,
            setRosettaDays,
            createCustomField,
            recountDays,
            appendDays,
            syncCartGuard
        } = createRentWidget();

        loadAssets();
        setRosettaDays();
        Ecwid.OnPageLoaded.add((page: { type: string }) => {
            switch (page.type) {
                case `CART`:
                    createCustomField();
                    setTimeout(recountDays, 300);
                    Ecwid.OnCartChanged.add(() => {
                        setTimeout(recountDays, 300);
                        syncCartGuard();
                    });
                    break;
                default:
                    setTimeout(recountDays, 300);
                    setTimeout(appendDays, 300);
                break;
        }
    });
});
