declare const Ecwid: any;
declare const ec: any;
declare const rosettaMessages: Record<string, any>;

type TimeField = "drop_off" | "pick_up";

interface TimeEntry {
    hour: number;
    minute: number;
    string: string;
}

class CsmtzRent {
    private _days: number = 1;
    private _dates: string | null = null;
    private _time: Record<TimeField, TimeEntry> = {
        drop_off: { hour: 12, minute: 0, string: "" },
        pick_up: { hour: 12, minute: 0, string: "" }
    };
    private _datesArray: Date[] | null = null;

    public _loadAssets = (): void => {
        const script = document.createElement(`script`);
        script.type = `text/javascript`;
        script.src = `https://cdn.jsdelivr.net/npm/flatpickr`;
        document.querySelector(`body`)?.appendChild(script);

        const styles = document.createElement(`link`);
        styles.rel = `stylesheet`;
        styles.href = `https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css`;
        document.querySelector(`head`)?.appendChild(styles);
    };

    public _createCustomField = (): void => {
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
            this._createDatePicker(dateInput);
        }
        this._createTimePickers();

        try {
            const fromInput = document.querySelector<HTMLInputElement>(`.from-picker input`);
            const toInput = document.querySelector<HTMLInputElement>(`.to-picker input`);

            if (fromInput) {
                fromInput.value = this._time["drop_off"].string;
                fromInput.dispatchEvent(new Event("input"));
            }
            if (toInput) {
                toInput.value = this._time["pick_up"].string;
                toInput.dispatchEvent(new Event("input"));
            }
        } catch (err) {
            console.log(err);
        }
    };

    private _createTimePickers = (): void => {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`.cstmz-time-picker input`));
        inputs.forEach((input, index) => {
            const field: TimeField = index === 0 ? `drop_off` : `pick_up`;
            const name = index === 0 ? `Drop Off` : `Pick Up`;

            (input as any).flatpickr({
                enableTime: true,
                noCalendar: true,
                defaultHour: this._time[field].hour,
                defaultMinute: this._time[field].minute,
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
                    this._time[field].hour = parseInt(hourStr, 10);
                    this._time[field].minute = parseInt(minuteStr, 10);
                    this._time[field].string = dateStr;
                }
            });
        });
    };

    private _createDatePicker = (field: HTMLInputElement): void => {
        this._toggleCheckoutEnabled(false);

        (field as any).flatpickr({
            mode: "range",
            minDate: new Date(),
            defaultDate: this._datesArray || undefined,
            dateFormat: "d/m/Y",
            onChange: (selectedDates: Date[], dateStr: string) => {
                field.value = dateStr;
                this._dates = dateStr;
                this._datesArray = selectedDates;

                const qty = this._getDaysBetween(selectedDates[0], selectedDates[1]);
                if (qty !== null) {
                    this._days = qty;
                    this._toggleLoadingClass(true);
                    const inputs = document.querySelectorAll<HTMLInputElement>(`.ec-cart-item__count--input input`);
                    let timeout = 100;
                    Array.from(inputs).forEach((input) => {
                        setTimeout(() => {
                            input.value = String(qty);
                            input.dispatchEvent(new Event(`input`));
                        }, timeout);

                        timeout += 1500;
                    });
                    setTimeout(() => {
                        this._toggleLoadingClass(false);
                        this._toggleCheckoutEnabled(true);
                    }, timeout);
                } else {
                    this._toggleCheckoutEnabled(false);
                }
                field.dispatchEvent(new Event(`input`));
                this._saveToExtraField(dateStr);
            },
            onReady: () => {
                if (this._datesArray !== null) {
                    const qty = this._getDaysBetween(this._datesArray[0], this._datesArray[1]);
                    if (qty !== null) {
                        this._days = qty;
                        this._toggleLoadingClass(true);
                        const inputs = document.querySelectorAll<HTMLInputElement>(`.ec-cart-item__count--input input`);
                        let timeout = 100;
                        Array.from(inputs).forEach((input) => {
                            setTimeout(() => {
                                input.value = String(qty);
                                input.dispatchEvent(new Event(`input`));
                            }, timeout);

                            timeout += 1500;
                        });
                        setTimeout(() => {
                            this._toggleLoadingClass(false);
                            this._toggleCheckoutEnabled(true);
                        }, timeout);
                    } else {
                        this._toggleCheckoutEnabled(false);
                    }
                    field.dispatchEvent(new Event(`input`));
                }
            }
        });

        if (this._dates !== null) {
            field.value = this._dates;
            field.dispatchEvent(new Event(`input`));
            this._toggleCheckoutEnabled(true);
        }
    };

    private _toggleLoadingClass = (loading: boolean): void => {
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
    };

    private _toggleCheckoutEnabled = (enabled: boolean): void => {
        const checkoutBtn = document.querySelector(`.ec-cart__button--checkout`);
        if (!checkoutBtn) {
            return;
        }
        if (!!enabled) {
            checkoutBtn.classList.remove(`form-control--disabled`);
        } else {
            checkoutBtn.classList.add(`form-control--disabled`);
        }
    };

    private _saveToExtraField = (val: string): void => {
        ec.order = ec.order || {};
        ec.order.extraFields = ec.order.extraFields || {};
        ec.order.extraFields.rent_dates = {
            type: "hidden",
            title: "Rent dates",
            value: val,
            orderDetailsDisplaySection: "order_comments"
        };
    };

    private _getDaysBetween = (date1?: Date, date2?: Date): number | null => {
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
    };

    public _setRosettaDays = (): void => {
        rosettaMessages["new-frontend"]["CartPage.ItemsCount.few"] = "{count} days";
        rosettaMessages["new-frontend"]["CartPage.ItemsCount.one"] = "{count} days";
        rosettaMessages["new-frontend"]["CartPage.ItemsCount.plural"] = "{count} days";
        rosettaMessages["new-frontend"]["CartPage.ItemsCount.singular"] = "1 day";
    };

    public _recountDays = (): void => {
        const label = document.querySelector<HTMLElement>(`.ec-cart-item-sum__count-label`);
        const mobileLabel = document.querySelector<HTMLElement>(`.ec-cart-item-sum--items .form-control__select-text`);
        if (label !== null) {
            label.textContent = this._days !== 1 ? `${this._days} days` : `${this._days} day`;
        } else if (mobileLabel !== null) {
            mobileLabel.textContent = this._days !== 1 ? `${this._days} days` : `${this._days} day`;
        }
    };

    public _appendDays = (): void => {
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
    };
}

Ecwid.OnAPILoaded.add(() => {
    const init = new CsmtzRent();
    init._loadAssets();
    init._setRosettaDays();
    Ecwid.OnPageLoaded.add((page: { type: string }) => {
        switch (page.type) {
            case `CART`:
                init._createCustomField();
                setTimeout(init._recountDays, 300);
                Ecwid.OnCartChanged.add(() => {
                    setTimeout(init._recountDays, 300);
                });
                break;
            default:
                setTimeout(init._recountDays, 300);
                setTimeout(init._appendDays, 300);
                break;
        }
    });
});
