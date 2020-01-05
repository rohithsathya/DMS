//import * as firebase from 'firebase-admin'; //this is for cloud functions
import * as firebase from 'firebase'; //this is for client side

import { ServicePackage, Vendor, VendorManagementService } from "./vms";
import { Slot, SlotManagementService } from "./sms";

export class OrderManagementService {

    db:any;
    orderCollection:string = "g_orders";
    slotCollection:string = "g_booked_slots";
    vms:VendorManagementService;
    sms:SlotManagementService;
    constructor(firebaseConfig:any){
        try{
            if(firebaseConfig){
                firebase.initializeApp(firebaseConfig);
            }
        }catch(e){
            
        }
        this.vms = new VendorManagementService(firebaseConfig);
        this.sms = new SlotManagementService(firebaseConfig);
        this.db = firebase.firestore();
    }
    public placeOrder(user:any,vendor:Vendor,packageId:string,addonIds:string[],date:number,vehicleType:string, bayIndex:number,startingSlot:number):Promise<Order> {
        return new Promise(async (resolve, reject) => {
            try {
                /*
                    const vehicleType:string= "HB";
                    const bayName:string = "B1";
                    const startingSlot:number = 0;
                */
                //bay index should be preset vendor bays
                if(bayIndex >= vendor.numberOfBays){
                    reject("Invalid Bay");
                    return;
                }
                const bayName = `${bayIndex}`;
                let servicePackageIds:string[] = [packageId].concat(addonIds);
                let totalSlotRequired:number = 0;
                let totalPrice:number = 0;
                let isPremium:boolean = false;
                let packageCount:number = 0; 
                //let servicePackageTypePackage:ServicePackage;
                let servicePackages:ServicePackage[] = this.vms.getServicePackages(vendor,servicePackageIds);

                for(let i=0;i<servicePackages.length;i++){
                    if(servicePackages[i].isPremium){
                        isPremium = true;
                    }
                    if(!servicePackages[i].isAddOn){
                        packageCount++;
                        //servicePackageTypePackage = servicePackages[i];
                    }
                    let priceConsoleForGivenVehicle =  servicePackages[i].priceConsole[vehicleType];
                    if(priceConsoleForGivenVehicle){
                        totalPrice +=priceConsoleForGivenVehicle.price;
                        totalSlotRequired +=priceConsoleForGivenVehicle.slotRequired;
                    }
                }
                //packageCount should be exactly 1 or else invalid request
                if(packageCount != 1){
                    reject("Invalid Request");
                    return;
                }

                const slotsToSave: Slot[] = this.sms.getRequiredSlots(vendor,startingSlot,totalSlotRequired,bayName,date,isPremium);

                 //conditions
                //all the slots needed should be available
                const slotsNeededIds: string[] = [];
                for (let i = 0; i < slotsToSave.length; i++) {
                    const slotId = `${slotsToSave[i].date}_${vendor.vendorId}_${slotsToSave[i].bay}_${slotsToSave[i].slot}`;
                    slotsNeededIds.push(slotId);
                }
                //check if the all the required slots are available or not
                const slotsAvailable: boolean = await this.sms.areSlotsAvailable(slotsNeededIds);
                if (slotsAvailable) {
                    //save slots
                    const savedOrder:Order =  await this.saveSlotAndOrderInBatch(slotsToSave,vendor,servicePackages,date,totalPrice,user,vehicleType);
                    resolve(savedOrder);
                } else {
                    //error slots not available
                    reject("Invalid Slots");
                    return;
                }
                
            }
            catch (e) {
                console.log('Error!!!', e);
                reject(e);
            }
        })
    }
    public getOrderById(orderId:string,userId:string):Promise<Order>{

        return new Promise((resolve,reject)=>{
            const orderRef =  this.db.collection(this.orderCollection).doc(orderId);
            orderRef.get()
                .then((doc:any )=> {
                    if (!doc.exists) {
                       reject(null);
                    } else {
                        const order:Order = doc.data();
                        if(order.bookedBy === userId){
                            resolve(order);
                        }else{
                            reject(null);
                        } 
                    }
                })
                .catch((err:any) => {
                    console.log('Error getting document', err);
                    reject(err);
                });
        })
    }
    public getOrderByIdForVendor(orderId:string,vendorId:string):Promise<Order>{

        return new Promise((resolve,reject)=>{
            const orderRef =  this.db.collection(this.orderCollection).doc(orderId);
            orderRef.get()
                .then((doc:any )=> {
                    if (!doc.exists) {
                       reject(null);
                    } else {
                        const order:Order = doc.data();
                        if(order.vendorId === vendorId){
                            resolve(order);
                        }else{
                            reject(null);
                        } 
                    }
                })
                .catch((err:any) => {
                    console.log('Error getting document', err);
                    reject(err);
                });
        })
    }
    public cancelOrder(orderId:string, user: any):Promise<any> {
        const returnObj:any = {"isError":false,"msg":""};
        const cutOffTime:number = 86400000; //24 hours in milliseconds
        let isrefund = true;
        return new Promise(async (resolve, reject) => {
            try {
                const todayInMilli:number = (new Date()).getTime();
                const order:Order = await this.getOrderById(orderId,user.uid);
                const serviceDate:Date = new Date(order.date);
                const diff = serviceDate.getTime() - todayInMilli;
                if (diff < 0) {
                    returnObj["isError"] = true;
                    returnObj["msg"] = "Can not cancel past date";
                    resolve(returnObj);
                    return;
                }
                if (diff < cutOffTime) {
                    isrefund = false;
                }
                await this.markOrderAsCancelInBatch(order,isrefund);
                returnObj["isError"] = false;
                returnObj["msg"] = isrefund?"canceled with refund":"canceled without refund";
                resolve(returnObj);
            }
            catch(e){
                console.log("Cancel Order Error !!!",e);
                reject(e);
            }
        });
    }
    public resechduleOrder(orderId:string,vendor:Vendor,user: any,date:number,bayIndex:number,startingSlot:number):Promise<any> {
        let returnObj:any = {"isError":false,"msg":""};
        const cutOffTime:number = 86400000; //24 hours in milliseconds
        return new Promise(async (resolve, reject) => {
            try {
                if(bayIndex >= vendor.numberOfBays){
                    returnObj = {"isError":true,"msg":"Invalid Bay"};
                    resolve(returnObj);
                    return;
                }
                const bayName = `${bayIndex}`;
                let isPremium:boolean = false;//req.body.isPremium as boolean;
                let packageCount:number = 0;
                let totalSlotRequired:number = 0;
                //let totalPrice:number = 0;
                //let servicePackageTypePackage:ServicePackage;
                const todayInMilli:number = (new Date()).getTime();
                const order:Order = await this.getOrderById(orderId,user.uid);
                //const vendorId: string = order.vendorId;
                const serviceDate:Date = new Date(order.date);
                const diff = serviceDate.getTime() - todayInMilli;

                if (diff < cutOffTime) {
                    returnObj = {"isError":true,"msg":"Can not resechdule"};
                    reject(returnObj);
                    return;
                }
                if(order.isRescheduled){
                    returnObj = {"isError":true,"msg":"Can not resechdule, as it is been already rescheduled"};
                    reject(returnObj);
                    return;
                }
                let servicePackages:ServicePackage[] = order.servicePackages;
                for(let i=0;i<servicePackages.length;i++){
                    if(servicePackages[i].isPremium){
                        isPremium = true;
                    }
                    if(!servicePackages[i].isAddOn){
                        packageCount++;
                        //servicePackageTypePackage = servicePackages[i];
                    }
                    let priceConsoleForGivenVehicle =  servicePackages[i].priceConsole[order.vehicleTypeCode];
                    if(priceConsoleForGivenVehicle){
                        //totalPrice +=priceConsoleForGivenVehicle.price;
                        totalSlotRequired +=priceConsoleForGivenVehicle.slotRequired;
                    }
                }
                //packageCount should be exactly 1 or else invalid request
                if(packageCount != 1){
                    reject("Invalid Request");
                    return;
                }
                const slotsToSave: Slot[] = this.sms.getRequiredSlots(vendor,startingSlot,totalSlotRequired,bayName,date,isPremium);
                //conditions
                //all the slots needed should be available
                const slotsNeededIds: string[] = [];
                for (let i = 0; i < slotsToSave.length; i++) {
                    const slotId = `${slotsToSave[i].date}_${vendor.vendorId}_${slotsToSave[i].bay}_${slotsToSave[i].slot}`;
                    slotsNeededIds.push(slotId);
                }
                //check if the all the required slots are available or not
                const slotsAvailable: boolean = await this.sms.areSlotsAvailable(slotsNeededIds);
                if (slotsAvailable) {
                    //save slots
                    await this.rescheduleOrderInBatch(order,slotsToSave,false,vendor.vendorId,date);
                    returnObj = {"isError":false,"msg":"successfully resechduled"};
                    resolve(returnObj);
                } else {
                    //error slots not available
                    reject("Invalid Slots");
                    return;
                }
            }
            catch(e){
                console.log("resechudle Order Error !!!",e);
                reject(e);
            }
        });
    }
    public closeOrder(orderId:string,vendorId:string){
        return new Promise(async(resolve,reject)=>{
            try {
                let orderToCancel: Order = await this.getOrderByIdForVendor(orderId,vendorId);
                if (orderToCancel) {
                    await this.markOrderAsClosedInBatch(orderToCancel);
                    let returnObj:any = {};
                    returnObj["isError"] = false;
                    returnObj["msg"] = "marked as closed successfully";
                    resolve(returnObj);
                } else {
                    reject('validation error');
                }

            } catch (e) {
                console.log("ERROR!!!", e);
                reject();
            }



        })
        

    }
    public getAllMyActiveOrders(user: any):Promise<Order[]> {
        return new Promise(async (resolve, reject) => {
            try {
                let querySnapshot = await this.db.collection(this.orderCollection).where("bookedBy", "==", user.uid).where('status', '==', OrderStatus.ACTIVE).get();
                if(querySnapshot.empty){
                    reject("No Records Found");
                }
                let _tempList:Order[] = [];
                querySnapshot.forEach((doc:any)=> {
                    _tempList.push(doc.data() as Order);
                });
                resolve(_tempList);
            } catch (e) {
                reject(e);
            }
        })
    }
    public getAllMyNonActiveOrders(user: any):Promise<Order[]> {
        return new Promise(async (resolve, reject) => {
            try {
                let inQuery: any = 'in';
                let querySnapshot = await this.db.collection(this.orderCollection).where("bookedBy", "==", user.uid).where('status', inQuery, [OrderStatus.COMPELETED,OrderStatus.CANCELED]).get();
                let _tempList:Order[] = [];
                querySnapshot.forEach((doc:any)=> {
                    _tempList.push(doc.data() as Order);
                });
                resolve(_tempList);
                // let collectionRef = this.afs.collection<any>(this.orderEntityName, ref => ref.where('bookedBy', '==', user.uid).where('status', inQuery, [DefaecoOrderStatus.COMPELETED, DefaecoOrderStatus.CANCELED]).orderBy("bookedOn", "desc").limit(100));
                // let dataList = await collectionRef.get().toPromise();
                // let _tempList = dataList.docs.map((doc) => {
                //     return doc.data() as DefaecoOrder;
                // });
                //resolve(_tempList);
            } catch (e) {
                reject(e);
            }
        })
    }
    public getAllActiveOrdersForVendor(vendorId: string):Promise<Order[]> {
        return new Promise(async (resolve, reject) => {
            try {
                let querySnapshot = await this.db.collection(this.orderCollection).where("vendorId", "==", vendorId).where('status', '==', OrderStatus.ACTIVE).get();
                if(querySnapshot.empty){
                    reject("No Records Found");
                }
                let _tempList:Order[] = [];
                querySnapshot.forEach((doc:any)=> {
                    _tempList.push(doc.data() as Order);
                });
                resolve(_tempList);
            } catch (e) {
                reject(e);
            }
        })
    }
    public getAllNonActiveOrdersForVendor(vendorId: string):Promise<Order[]> {
        return new Promise(async (resolve, reject) => {
            try {
                let inQuery: any = 'in';
                let querySnapshot = await this.db.collection(this.orderCollection).where("vendorId", "==", vendorId).where('status', inQuery, [OrderStatus.COMPELETED,OrderStatus.CANCELED]).get();
                if(querySnapshot.empty){
                    reject("No Records Found");
                }
                let _tempList:Order[] = [];
                querySnapshot.forEach((doc:any)=> {
                    _tempList.push(doc.data() as Order);
                });
                resolve(_tempList);
            } catch (e) {
                reject(e);
            }
        })
    }
    private saveSlotAndOrderInBatch(slots:Slot[],vendor:Vendor,servicePackages:ServicePackage[],date:number,totalPrice:number,user:any,vehicleTypeCode:string):Promise<Order>{

        return new Promise(async (res, rej) => {
            try {
                let batch = this.db.batch();
                const id = this.db.collection(this.orderCollection).doc().id;
                //save the slots
                let slotIds:string[] = [];
                for(let i=0;i<slots.length;i++){
                    const slotId = `${slots[i].date}_${vendor.vendorId}_${slots[i].bay}_${slots[i].slot}`;
                    slotIds.push(slotId);
                    slots[i].id = slotId;
                    slots[i].vendorId = vendor.vendorId;
                    slots[i].orderId = id;
                    const slotTosave_pureObj = JSON.parse(JSON.stringify(slots[i]));
                    const slotRef = this.db.collection(this.slotCollection).doc(slotId)
                    batch.set(slotRef, slotTosave_pureObj);

                }
                //save the order
                const order = new Order();
                order.id = id;
                order.vendorId = vendor.vendorId
                order.date = date;
                order.slotIds = slotIds;
                order.totalPrice = totalPrice;
                order.status = OrderStatus.ACTIVE;
                order.bookedBy = user.uid;
                order.bookedOn= (new Date()).getTime();
                order.servicePackages = servicePackages;
                order.vehicleTypeCode = vehicleTypeCode;
                order.ui = {
                    "vendorName": vendor.vendorName,
                    "userName": user.displayName,
                }
                let order_pure = JSON.parse(JSON.stringify(order));
                const orderRef = this.db.collection(this.orderCollection).doc(id)
                batch.set(orderRef, order_pure);
                await batch.commit();
                res(order);
            } catch (e) {
                console.log("Error", e);
                rej();
            }

        }) 


    }
    private markOrderAsCancelInBatch(order:Order,isrefund:boolean):Promise<Order>{

        return new Promise(async(resolve,reject)=>{
            try{
                let batch = this.db.batch();
                //delete the slots
                for(let i=0;i<order.slotIds.length;i++){
                    const slotRef = this.db.collection(this.slotCollection).doc(order.slotIds[i])
                    batch.delete(slotRef);
                }
                //update the order
                order.status = OrderStatus.CANCELED;
                order.isRefund = isrefund;
                order.bookedOn = (new Date()).getTime();
                const order_pure = JSON.parse(JSON.stringify(order));
                const orderRef = this.db.collection(this.orderCollection).doc(order.id);
                batch.set(orderRef, order_pure);
                await batch.commit();
                resolve(order);
            }catch(e){
                reject(e);
            }
        })
    }
    private markOrderAsClosedInBatch(order:Order):Promise<Order>{

        return new Promise(async(resolve,reject)=>{
            try{
                let batch = this.db.batch();
                //delete the slots
                for(let i=0;i<order.slotIds.length;i++){
                    const slotRef = this.db.collection(this.slotCollection).doc(order.slotIds[i])
                    batch.delete(slotRef);
                }
                //update the order
                order.status = OrderStatus.COMPELETED;
                order.bookedOn = (new Date()).getTime();
                const order_pure = JSON.parse(JSON.stringify(order));
                const orderRef = this.db.collection(this.orderCollection).doc(order.id);
                batch.set(orderRef, order_pure);
                await batch.commit();
                resolve(order);
            }catch(e){
                reject(e);
            }
        })
    }
    private rescheduleOrderInBatch(order:Order,newSlots:Slot[],isrefund:boolean,vendorId:string,date:number):Promise<Order>{

        return new Promise(async(resolve,reject)=>{
            try{
                let batch = this.db.batch();
                //delete the slots
                for(let i=0;i<order.slotIds.length;i++){
                    const slotRef = this.db.collection(this.slotCollection).doc(order.slotIds[i])
                    batch.delete(slotRef);
                }
                //add new slots
                let slotIds:string[] = [];
                for(let i=0;i<newSlots.length;i++){
                    const slotId = `${newSlots[i].date}_${vendorId}_${newSlots[i].bay}_${newSlots[i].slot}`;
                    slotIds.push(slotId);
                    newSlots[i].id = slotId;
                    newSlots[i].vendorId = vendorId;
                    const slotTosave_pureObj = JSON.parse(JSON.stringify(newSlots[i]));
                    const slotRef = this.db.collection(this.slotCollection).doc(slotId)
                    batch.set(slotRef, slotTosave_pureObj);

                }
                //update the order
                order.date = date;
                order.bookedOn = (new Date()).getTime();
                order.slotIds = slotIds;
                order.isRescheduled = true;
                order.isRefund = isrefund;
                order.bookedOn = (new Date()).getTime();
                const order_pure = JSON.parse(JSON.stringify(order));
                const orderRef = this.db.collection(this.orderCollection).doc(order.id);
                batch.set(orderRef, order_pure);
                await batch.commit();
                resolve(order);
            }catch(e){
                reject(e);
            }
        })
    }

}
export class Order {
    bookedBy: string="";
    bookedOn: number=0;
    date: number=0;
    id: string="";
    status: string="";
    totalPrice: number=0;
    vendorId: string="";
    isRefund:boolean = false;
    isRescheduled:boolean = false;
    servicePackages:ServicePackage[] = [];
    slotIds: string[] = [];
    slot: any;
    ui: any;
    vehicleTypeCode:string="";

}
export const enum OrderStatus {
    DRAFT = 'DRAFT',
    ACTIVE = 'ACTIVE',
    INPROGRESS = 'INPROGRESS',
    CANCELED = 'CANCELED',
    COMPELETED = 'COMPELETED'
}