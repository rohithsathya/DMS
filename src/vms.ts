//import * as firebase from 'firebase-admin'; //this is for cloud functions
import * as firebase from 'firebase'; //this is for client side
import * as geohash from 'ngeohash'
//For Admin uncomment create user code in savevendor() at vms

export class VendorManagementService {

    db: any;
    vendorOverviewCollection: string = "g_vendor_overview";
    vendorDetailsCollection: string = "g_vendor_details_g";
    constructor(firebaseConfig: any) {
        try {
            if(firebaseConfig){
                firebase.initializeApp(firebaseConfig);
            }
            
        } catch (e) {

        }
        this.db = firebase.firestore();
    }
    public getDefaultVendor(): Vendor {
        const vendor: Vendor = new Vendor();
        const basicPackage: ServicePackage = new ServicePackage('PKBW', 'Basic Wash', 'Basic Wash', false, false);
        const advancedPackage: ServicePackage = new ServicePackage('PKAW', 'Advance Car Wash', 'Advance Car Wash', false, false);
        const cardetailingPackage: ServicePackage = new ServicePackage('PKCD', 'Car Detailing', 'Car Detailing', true, false);
        const carPaintingPackage: ServicePackage = new ServicePackage('PKCPP', 'Car Paint Protection', 'Car Paint Protection', true, false);
        const addOn1: ServicePackage = new ServicePackage('ADIV', 'Interior vacuuming', 'Interior vacuuming', false, true);
        const addOn2: ServicePackage = new ServicePackage('ADFMC', 'Foot mat cleaning', 'Foot mat cleaning', false, true);
        const addOn3: ServicePackage = new ServicePackage('ADFCE', 'Foam cleaning of exterior', 'Foam cleaning of exterior', false, true);
        const addOn4: ServicePackage = new ServicePackage('ADTAC', 'Tyre arches cleaning', 'Tyre arches cleaning', false, true);
        const addOn5: ServicePackage = new ServicePackage('ADUBW', 'Underbody wash', 'Underbody wash', false, true);
        const addOn6: ServicePackage = new ServicePackage('ADESW', 'Engine steam wash', 'Engine steam wash', false, true);
        const addOn7: ServicePackage = new ServicePackage('ADSDC', 'Side door cleaning', 'Side door cleaning', false, true);
        const addOn8: ServicePackage = new ServicePackage('ADDFC', 'Door frames cleaning', 'Door frames cleaning', false, true);
        const addOn9: ServicePackage = new ServicePackage('ADDBC', 'Dashboard cleaning', 'Dashboard cleaning', false, true);

        vendor.servicePackages.push(basicPackage);
        vendor.servicePackages.push(advancedPackage);
        vendor.servicePackages.push(cardetailingPackage);
        vendor.servicePackages.push(carPaintingPackage);
        vendor.servicePackages.push(addOn1);
        vendor.servicePackages.push(addOn2);
        vendor.servicePackages.push(addOn3);
        vendor.servicePackages.push(addOn4);
        vendor.servicePackages.push(addOn5);
        vendor.servicePackages.push(addOn6);
        vendor.servicePackages.push(addOn7);
        vendor.servicePackages.push(addOn8);
        vendor.servicePackages.push(addOn9);

        return vendor;
    }

    public saveVendor(vendor: Vendor): Promise<any> {

        return new Promise(async (resolve, reject) => {

            try {
                vendor.workEndHours = this.convertTimePickerTimeToTime(vendor.workEndHoursStr);
                vendor.workStartHours = this.convertTimePickerTimeToTime(vendor.workStartHoursStr);
                if (vendor.workStartHours >= vendor.workEndHours) {
                    reject("Shop open time greater than shop close time");
                    return;
                }
                vendor.slotDuration = vendor.slotDurationInMinutes / 60;
                vendor.addressPos = new GeoPosition(vendor.latitude, vendor.longitude);
                const isValid = this.validateVendor(vendor);
                if (isValid) {
                    //vendor_overview - basic vendor details//vendor_details - complete vendor details
                     //create vendor user
                    /*
                    await firebase.auth().createUser({
                        email: vendor.emailId,
                        emailVerified: false,
                        password: '123456',
                        displayName: vendor.vendorName,
                        disabled: false
                      })
                    */

                    // await firebase.auth().createUserWithEmailAndPassword(vendor.emailId, '123456'); //this will confirm if the email id is already taken
                    vendor.vendorId = this.db.collection(this.vendorOverviewCollection).doc().id;
                    let vendor_details_pure = JSON.parse(JSON.stringify(vendor));
                    let vendor_overview_pure = JSON.parse(JSON.stringify(vendor));

                    vendor_overview_pure.servicePackages = [];
                    const vendorOverviewRef = this.db.collection(this.vendorOverviewCollection).doc(vendor.vendorId);
                    const vendorDetailsRef = this.db.collection(this.vendorDetailsCollection).doc(vendor.vendorId);
                    
                    let batch = this.db.batch();
                    batch.set(vendorOverviewRef, vendor_overview_pure);
                    batch.set(vendorDetailsRef, vendor_details_pure);
                    await batch.commit();

                    resolve("Document successfully written!");
                } else {
                    reject("Not saved Error, Enter all manditory fields")
                }
            } catch (e) {
                reject(e);
            }
        })




    }

    public updateVendor(vendor: Vendor): Promise<any> {

        return new Promise(async (resolve, reject) => {

            try {
                vendor.workEndHours = this.convertTimePickerTimeToTime(vendor.workEndHoursStr);
                vendor.workStartHours = this.convertTimePickerTimeToTime(vendor.workStartHoursStr);
                if (vendor.workStartHours >= vendor.workEndHours) {
                    reject("Shop open time greater than shop close time");
                    return;
                }
                vendor.slotDuration = vendor.slotDurationInMinutes / 60;
                vendor.addressPos = new GeoPosition(vendor.latitude, vendor.longitude);
                const isValid = this.validateVendor(vendor);
                if (isValid) {
                    //first get the vendor in DB
                    let vendorToUpdate: Vendor = await this.getVendorByVendorId(vendor.vendorId);
                    //things that can be updated
                    vendorToUpdate.GSTN = vendor.GSTN;
                    vendorToUpdate.IFSCCode = vendor.IFSCCode;
                    vendorToUpdate.accountNumber = vendor.accountNumber;
                    vendorToUpdate.address = vendor.address;
                    vendorToUpdate.addressPos = vendor.addressPos;
                    vendorToUpdate.amenities = vendor.amenities;
                    vendorToUpdate.bankNumber = vendor.bankNumber;
                    vendorToUpdate.contactNumber = vendor.contactNumber;
                    vendorToUpdate.latitude = vendor.latitude;
                    vendorToUpdate.longitude = vendor.longitude;
                    vendorToUpdate.numberOfBays = vendor.numberOfBays;
                    vendorToUpdate.numberOfPremiumBays = vendor.numberOfPremiumBays;
                    vendorToUpdate.ownerName = vendor.ownerName;
                    vendorToUpdate.servicePackages = vendor.servicePackages;
                    vendorToUpdate.slotDuration = vendor.slotDuration;
                    vendorToUpdate.slotDurationInMinutes = vendor.slotDurationInMinutes;
                    vendorToUpdate.website = vendor.website;
                    vendorToUpdate.workEndHours = vendor.workEndHours;
                    vendorToUpdate.workEndHoursStr = vendor.workEndHoursStr;
                    vendorToUpdate.workStartHours = vendor.workStartHours;
                    vendorToUpdate.workStartHoursStr = vendor.workStartHoursStr;
                    let vendor_details_pure = JSON.parse(JSON.stringify(vendorToUpdate));
                    let vendor_overview_pure = JSON.parse(JSON.stringify(vendorToUpdate));
                    vendor_overview_pure.servicePackages = [];
                    const vendorOverviewRef = this.db.collection(this.vendorOverviewCollection).doc(vendorToUpdate.vendorId);
                    const vendorDetailsRef = this.db.collection(this.vendorDetailsCollection).doc(vendorToUpdate.vendorId);
                    let batch = this.db.batch();
                    batch.set(vendorOverviewRef, vendor_overview_pure);
                    batch.set(vendorDetailsRef, vendor_details_pure);
                    await batch.commit();
                    resolve("Document successfully written!");
                } else {
                    reject("Not saved Error, Enter all manditory fields")
                }
            } catch (e) {
                reject(e);
            }
        })




    }

    public getVendorByEmailId(emailId: string): Promise<Vendor> {
        return new Promise(async (res, rej) => {
            try {
                let querySnapshot = await this.db.collection(this.vendorDetailsCollection).where("emailId", "==", emailId).get();
                if (querySnapshot.empty) {
                    rej("No Records Found");
                }
                querySnapshot.forEach((doc: any) => {
                    res(doc.data() as Vendor);
                });
            } catch (e) {
                console.log("Error", e);
                rej(e);
            }
        })
    }
    public getVendorByVendorId(vendorId: string): Promise<Vendor> {
        return new Promise(async (res, rej) => {
            try {
                let querySnapshot = await this.db.collection(this.vendorDetailsCollection).doc(vendorId).get();
                if (querySnapshot.empty) {
                    rej("No Records Found");
                }
                res(querySnapshot.data() as Vendor);
            } catch (e) {
                console.log("Error", e);
                rej(e);
            }
        })
    }

    public getVendorListByDistance(lat: number, lan: number): Promise<Vendor[]> {
        return new Promise(async (res, rej) => {
            try {
                const range = this.getGeohashRange(lat, lan, 1);
                let querySnapshot = await this.db.collection(this.vendorOverviewCollection).where('addressPos.hash', ">=", range.lower).where('addressPos.hash', "<=", range.upper).get();

                let _tempList: Vendor[] = [];
                querySnapshot.forEach((doc: any) => {
                    let vendor: Vendor = doc.data() as Vendor;
                    _tempList.push(vendor);
                });
                res(_tempList);
            } catch (e) {
                rej(e);
            }

        })
    }
    public getAllVendorList(): Promise<Vendor[]> {
        return new Promise(async (res, rej) => {
            try {
                let querySnapshot = await this.db.collection(this.vendorOverviewCollection).get();

                let _tempList: Vendor[] = [];
                querySnapshot.forEach((doc: any) => {
                    let vendor: Vendor = doc.data() as Vendor;
                    _tempList.push(vendor);
                });
                res(_tempList);
            } catch (e) {
                rej(e);
            }

        })
    }

    public getServicePackages(vendor: Vendor, serviceIds: string[]): ServicePackage[] {
        let servicePackages: ServicePackage[] = [];

        for (let i = 0; i < serviceIds.length; i++) {
            const serviceId = serviceIds[i];
            for (let j = 0; j < vendor.servicePackages.length; j++) {
                if (vendor.servicePackages[j].code == serviceId) {
                    servicePackages.push(vendor.servicePackages[j]);
                    break;

                }
            }
        }
        return servicePackages;
    }

    //utility methods
    public validateVendor(vendor: Vendor): boolean {
        let isvalid: boolean = false;
        try {
            const validFlag1 = this.checkIfIsValidString(vendor.vendorName) ? true : false;
            const validFlag2 = this.checkIfIsValidString(vendor.ownerName) ? true : false;
            const validFlag3 = this.checkIfIsValidPhoneNumber(vendor.contactNumber) ? true : false;
            const validFlag4 = this.checkIfIsValidString(vendor.address) ? true : false;
            const validFlag5 = this.checkIfIsValidEmail(vendor.emailId) ? true : false;
            const validFlag6 = this.checkIfIsValidTime(vendor.workStartHours) ? true : false;
            const validFlag7 = this.checkIfIsValidTime(vendor.workEndHours) ? true : false;
            const validFlag8 = this.checkIfIsValidTime(vendor.slotDuration) ? true : false;
            const validFlag9 = vendor.numberOfBays > 0 ? true : false;
            if (validFlag1 && validFlag2 && validFlag3 && validFlag4 && validFlag5 && validFlag6 && validFlag7 && validFlag8 && validFlag9) {
                isvalid = true;
            }
        } catch (e) {
            console.log("Error", e);
            isvalid = false;
        }

        return isvalid;
    }
    public checkIfIsValidString(str: string): boolean {
        let isValid: boolean = false;
        if (str && str.length > 0) {
            isValid = true;
        }
        return isValid;
    }
    public checkIfIsValidPhoneNumber(phoneNumber: string) {

        const mobileRegex = /^\d{10}$/g;
        return mobileRegex.test(phoneNumber);
    }
    public checkIfIsValidEmail(email: string) {
        const emailRegex = /\S+@\S+\.\S+/;
        return emailRegex.test(email);
    }
    public checkIfIsValidTime(time: number) {
        return (time >= 0 && time < 24) ? true : false;
    }
    public convertTimePickerTimeToTime(time: string) {
        let parts = time.split(':');
        let part1 = parts[0];
        let partsSecond = parts[1].split(' ');
        let part2 = partsSecond[0];
        let part3 = partsSecond[1];

        let hours = parseFloat(part1);
        let minutes = parseFloat(part2);
        let additionalHrs = part3 === "PM" ? 12 : 0;
        return (hours + additionalHrs) + (minutes / 60);

    }
    // Calculate the upper and lower boundary geohashes for
    // a given latitude, longitude, and distance in miles
    public getGeohashRange(latitude: number, longitude: number, distance: number) { // distance ->miles
        const lat = 0.0144927536231884; // degrees latitude per mile
        const lon = 0.0181818181818182; // degrees longitude per mile

        const lowerLat = latitude - lat * distance;
        const lowerLon = longitude - lon * distance;

        const upperLat = latitude + lat * distance;
        const upperLon = longitude + lon * distance;

        const lower = geohash.encode(lowerLat, lowerLon);
        const upper = geohash.encode(upperLat, upperLon);

        return {
            lower,
            upper
        };
    };
}

export class Vendor {
    vendorName: string = "ABC CarWash";
    vendorId: string = "";
    ownerName: string = "Rohith";
    contactNumber: string = "9740988173";
    contactNumber1: string = "";
    contactNumber2: string = "";
    address: string = "#S3-1205, smondoville, Electronic city BLR";
    latitude: number = 0;
    longitude: number = 0;
    addressPos: GeoPosition = new GeoPosition();
    city: string = "";
    state: string = "";
    country: string = "";
    emailId: string = "test@test.com";
    emailId1: string = "";
    emailId2: string = "";
    website: string = "";
    GSTN: string = "";
    bankNumber: string = "";
    IFSCCode: string = "";
    accountNumber: string = "";
    workStartHours: number = 8.5;
    workStartHoursStr: string = "09:00 AM";
    workEndHours: number = 20;
    workEndHoursStr: string = "06:00 PM";
    slotDuration: number = 0.5;
    slotDurationInMinutes: number = 60;
    amenities: string[] = [];
    numberOfBays: number = 3;
    numberOfPremiumBays: number = 0;
    servicePackages: ServicePackage[] = [];
}

export class GeoPosition {
    hash: string = "";
    lan: number = 0;
    lat: number = 0;
    constructor(lat: number = 0, lan: number = 0, hash: string = "") {
        this.lat = lat;
        this.lan = lan;
        this.hash = geohash.encode(lat, lan);
    }
}
export class ServicePackage {
    code: string = "";
    name: string = "";
    description: string = "";
    priceConsole: any = {};
    isPremium: boolean = false;
    isAddOn: boolean = false;

    constructor(code: string = "", name: string = "", description: string = "", isPremium: boolean = false, isAddOn: boolean = false) {
        this.code = code;
        this.name = name;
        this.description = description;
        this.isPremium = isPremium;
        this.isAddOn = isAddOn;
        this.priceConsole['HB'] = new PriceConsole(0, 0, 'Hatchback', 'HB');
        this.priceConsole['SE'] = new PriceConsole(0, 0, 'Sedan', 'SE');
        this.priceConsole['SUV'] = new PriceConsole(0, 0, 'SUV', 'SUV');
        this.priceConsole['LMV'] = new PriceConsole(0, 0, 'LMV', 'LMV');
        this.priceConsole['TW'] = new PriceConsole(0, 0, 'Two Wheeler', 'TW');
    }
}
export class PriceConsole {
    slotRequired: number = 0;
    price: number = 0;
    type: string = "";
    code: string = "";
    constructor(slotRequired?: number, price?: number, type?: string, code?: string) {
        this.slotRequired = slotRequired ? slotRequired : 0;
        this.price = price ? price : 0;
        this.type = type ? type : '';
        this.code = code ? code : '';
    }
}