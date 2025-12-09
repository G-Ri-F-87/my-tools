class CsmtzRent {
    constructor() {
        this._loadAssets = () => {
            let script = document.createElement(`script`);
                script.type = `text/javascript`;
                script.src = `https://cdn.jsdelivr.net/npm/flatpickr`;
                document.querySelector(`body`).appendChild(script);

            let styles = document.createElement(`link`);
                styles.rel = `stylesheet`;
                styles.href = `https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css`;
                document.querySelector(`head`).appendChild(styles);
        };

        this._days = 1;
        this._dates = null;
        this._time = {};
        this._time["drop_off"] = {hour: 12,minute: 0,string: ""};
        this._time["pick_up"] = {hour: 12,minute: 0,string: ""};
        this._datesArray = null;

        this._createCustomField = () => {
            let exists = document.querySelector(`.cstmz-picker`),
                parent = document.querySelector(`.ec-cart-email`);
                if (exists !== null) {
                    exists.parentNode.removeChild(exists);
                };
                let block = document.createElement(`div`);
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
 
                    this._createDatePicker(block.querySelector(`input`));
                    this._createTimePickers();
                

                try {
                    document.querySelector(`.from-picker input`).value = this._time["drop_off"]["string"];
                    document.querySelector(`.to-picker input`).value = this._time["pick_up"]["string"];
                    document.querySelector(`.from-picker input`).dispatchEvent(new Event("input"));
                    document.querySelector(`.to-picker input`).dispatchEvent(new Event("input"));
                } catch (err) {
                    console.log(err);
                };
        }

        this._createTimePickers = () => {
            [].slice.apply(document.querySelectorAll(`.cstmz-time-picker input`)).map((input,index) => {
                let field = index === 0 ? `drop_off` : `pick_up`,
                    name = index === 0 ? `Drop Off` : `Pick Up`;

                input.flatpickr({ 
                    enableTime: true,
                    noCalendar: true,
                    defaultHour: this._time[field]["hour"],
                    defaultMinute: this._time[field]["minute"],
                    onChange: (selectedDates, dateStr, instance) => {
                            ec.order = ec.order || {};
                            ec.order.extraFields = ec.order.extraFields || {};
                            ec.order.extraFields[`time_${field}`] = {
                                'type': 'hidden',
                                'title': `Requested ${name} Time`,
                                'value': dateStr,
                                'orderDetailsDisplaySection': 'order_comments'
                            };
                            let split = dateStr.split(":",2);
                            this._time[field]["hour"] = parseInt(split[0]);
                            this._time[field]["minute"] = parseInt(split[1]);
                            this._time[field]["string"] = dateStr;
                    }
                });
            });
        };

        this._createDatePicker = (field) => {
            
            this._toggleCheckoutEnabled(false);
            
            field.flatpickr({
                mode: "range",
                minDate: new Date(),
                defaultDate: this._datesArray,
                dateFormat: "d/m/Y",
                onChange: (selectedDates, dateStr, instance) => {
                    field.value = dateStr;
                    this._dates = dateStr;
                    
                    this._datesArray = selectedDates;

                    let qty = this._getDaysBetween(selectedDates[0],selectedDates[1]);
                        if (qty !== null) {
                            this._days = qty;
                            this._toggleLoadingClass(true);
                            let inputs = document.querySelectorAll(`.ec-cart-item__count--input input`);
                            let timeout = 100;
                            [].slice.apply(inputs).map(input => {
                                    setTimeout(() => { 
                                        input.value = qty;
                                        input.dispatchEvent(new Event(`input`))
                                    },timeout);

                                    timeout += 1500;
                                });
                            setTimeout(() => {
                                this._toggleLoadingClass(false);
                                this._toggleCheckoutEnabled(true);
                            },timeout);
                        } else {
                            this._toggleCheckoutEnabled(false);
                        }
                        field.dispatchEvent(new Event(`input`));
                    this._saveToExtraField(dateStr);
                },
                onReady: () => {
                    if (this._datesArray !== null) {

                        let qty = this._getDaysBetween(this._datesArray[0],this._datesArray[1]);
                            if (qty !== null) {
                                this._days = qty;
                                this._toggleLoadingClass(true);
                                let inputs = document.querySelectorAll(`.ec-cart-item__count--input input`);
                                let timeout = 100;
                                [].slice.apply(inputs).map(input => {
                                        setTimeout(() => { 
                                            input.value = qty;
                                            input.dispatchEvent(new Event(`input`))
                                        },timeout);

                                        timeout += 1500;
                                    });
                                setTimeout(() => {
                                    this._toggleLoadingClass(false);
                                    this._toggleCheckoutEnabled(true);
                                },timeout);
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

        this._toggleLoadingClass = (loading) => {
            let checkoutBtn = document.querySelector(`.ec-cart__button--checkout`);
                if (!!loading) {
                    checkoutBtn.classList.add(`form-control--loading`);
                    checkoutBtn.classList.add(`form-control--disabled`);
                } else {
                    checkoutBtn.classList.remove(`form-control--loading`);
                    checkoutBtn.classList.remove(`form-control--disabled`);
                }
        };

        this._toggleCheckoutEnabled = (enabled) => {
            let checkoutBtn = document.querySelector(`.ec-cart__button--checkout`);
                if (!!enabled) {
                    checkoutBtn.classList.remove(`form-control--disabled`);
                } else {
                    checkoutBtn.classList.add(`form-control--disabled`);
                }
        };
        
        this._saveToExtraField = (val) => {
            ec.order = ec.order || {};
            ec.order.extraFields = ec.order.extraFields || {};
            ec.order.extraFields.rent_dates = {
                'type': 'hidden',
                'title': "Rent dates",
                'value': val,
                'orderDetailsDisplaySection': 'order_comments'
            };
        };

        this._getDaysBetween = (date1, date2) => {
                try {
                let one_day=1000*60*60*24,
                    date1_ms = date1.getTime(),
                    date2_ms = date2.getTime(),
                    difference_ms = date2_ms - date1_ms;
                    return Math.ceil(difference_ms/one_day);
                } catch (err) {
                    return null;
                }
        };

        this._setRosettaDays = () => {
            rosettaMessages["new-frontend"]["CartPage.ItemsCount.few"] =  "{count} days";
            rosettaMessages["new-frontend"]["CartPage.ItemsCount.one"] = "{count} days";
            rosettaMessages["new-frontend"]["CartPage.ItemsCount.plural"] =  "{count} days";
            rosettaMessages["new-frontend"]["CartPage.ItemsCount.singular"] =  "1 day";
        }

        this._recountDays = () => {
            let label = document.querySelector(`.ec-cart-item-sum__count-label`),
                mobileLabel = document.querySelector(`.ec-cart-item-sum--items .form-control__select-text`);
                if (label !== null) {
                    label.textContent = this._days !== 1 ? `${this._days} days` : `${this._days} day`;
                } else if (mobileLabel !== null) {
                    mobileLabel.textContent = this._days !== 1 ? `${this._days} days` : `${this._days} day`;
                }
        }

        this._appendDays = () => {
            ec.order = ec.order || {};
            ec.order.extraFields = ec.order.extraFields || {};
            let days = ec.order.extraFields.rent_dates || null,
                emailBlock = document.querySelector(`.ec-cart-step--email .ec-cart-step__wrap`),
                exists = document.querySelector(`.cstmz-days`);
                if (emailBlock !== null && days !== null && exists === null) { 
                    let daysBlock = document.createElement(`div`);
                        daysBlock.className = `cstmz-days`;
                        daysBlock.innerHTML = `Rent days: ${days["value"]}`;
                        emailBlock.appendChild(daysBlock);
                }
        }
    }
}

Ecwid.OnAPILoaded.add(() => {
    let init = new CsmtzRent();
        init._loadAssets();
        init._setRosettaDays();
        Ecwid.OnPageLoaded.add((page) => {
            switch (page.type) {
                case `CART`:
                    init._createCustomField();
                    setTimeout(init._recountDays,300);
                    Ecwid.OnCartChanged.add((cart) => {
                        setTimeout(init._recountDays,300);
                    });
                    break;
                default: 
                    setTimeout(init._recountDays,300);
                    setTimeout(init._appendDays,300);
                    break;
            }
        });
});