//import * as firebase from 'firebase-admin'; //this is for cloud functions
import * as firebase from 'firebase'; //this is for client side
import {Vendor} from './vms';

export class SlotManagementService {

    db:any;
    slotCollection:string = "g_booked_slots";
    constructor(firebaseConfig:any){
        try{
            if(firebaseConfig){
                firebase.initializeApp(firebaseConfig);
            }
        }catch(e){
            
        }
        this.db = firebase.firestore();
    }
    public saveSlot(slot:Slot,vendorId:string):Promise<any>{
        return new Promise(async (res, rej) => {
            try {
                const slotId = `${slot.date}_${vendorId}_${slot.bay}_${slot.slot}`;
                slot.id = slotId;
                slot.vendorId = vendorId;
                const slotTosave_pureObj = JSON.parse(JSON.stringify(slot));
                await this.db.collection(this.slotCollection).doc(slotId).set(slotTosave_pureObj);
                res();
            } catch (e) {
                console.log("Error", e);
                rej();
            }

        }) 
    }
    public saveSlots(slots:Slot[],vendorId:string):Promise<any>{
        return new Promise(async (res, rej) => {
            try {
                let batch = this.db.batch();
                for(let i=0;i<slots.length;i++){
                    const slotId = `${slots[i].date}_${vendorId}_${slots[i].bay}_${slots[i].slot}`;
                    slots[i].id = slotId;
                    slots[i].vendorId = vendorId;
                    const slotTosave_pureObj = JSON.parse(JSON.stringify(slots[i]));
                    const slotRef = this.db.collection(this.slotCollection).doc(slotId)
                    batch.set(slotRef, slotTosave_pureObj);

                }
                await batch.commit();
                res();
            } catch (e) {
                console.log("Error", e);
                rej();
            }

        }) 
    }
    public areSlotsAvailable(slotsNeededIds: string[]):Promise<boolean>{
        return new Promise(async (resolve, reject) => {
            try {
                const soltsRef = this.db.collection(this.slotCollection).where('id', 'in', slotsNeededIds);
                let querySnapshot = await soltsRef.get();
                if (querySnapshot.size === 0) {
                    resolve(true);
                } else {
                    resolve(false);
                } 
               
            } catch (e) {
                console.log("Error", e);
                reject(e);
            }
        })
    }
    public getBookedSlotforGivenDates(datesStringArray:string[],vendorId:string):Promise<Slot[]>{

        return new Promise(async (resolve,reject)=>{
            try{
                let inQuery: any = 'in';
                let bookedSlots:Slot[] = [];
                const slotsBookedCollection = this.db.collection(this.slotCollection).where('date', inQuery, datesStringArray).where('vendorId', '==', vendorId);
                const slotsList = await slotsBookedCollection.get();
                slotsList.forEach((doc:any) => {
                    let slot: Slot = doc.data() as Slot;
                    bookedSlots.push(slot);
                });
                resolve(bookedSlots);

            }catch(e){
                console.log("Error",e);
                reject(e);
            }
        })

       

    }
    public getBookedSlotsForGivenDate(date: string,vendorId:string):Promise<Slot[]> {
        return new Promise(async (resolve,reject)=>{
            try{
                //let inQuery: any = 'in';
                let bookedSlots:Slot[] = [];
                const slotsBookedCollection = this.db.collection(this.slotCollection).where('date', '==', date).where('vendorId', '==', vendorId);
                const slotsList = await slotsBookedCollection.get();
                slotsList.forEach((doc:any) => {
                    let slot: Slot = doc.data() as Slot;
                    bookedSlots.push(slot);
                });
                resolve(bookedSlots);

            }catch(e){
                console.log("Error",e);
                reject(e);
            }
        })
    }
    /**
     * @param startingSlot is index 
     * returns empty array in case of error
     */
    public getRequiredSlots(vendor:Vendor,startingSlot:number,requiredSlots:number,bayName:string,date:number,isPremium:boolean):Slot[]{

        let slotsToSave:Slot[] = [];
        const totalNoOfSlots =Math.floor((vendor.workStartHours - vendor.workEndHours) / vendor.slotDuration);
        const endSlots = startingSlot + requiredSlots;
        const today = new Date(date);
        const tomorrow = new Date(date);
        tomorrow.setDate(tomorrow.getDate() + 1);

        for(let i=startingSlot;i<endSlots;i++){

            const slotTosave:Slot = new Slot();
            slotTosave.bay = bayName;
            slotTosave.date = this.formatDate(today.getTime());
            slotTosave.slot = i;
            slotTosave.time = this.getTimeFromSlot(i,vendor);
            slotTosave.isExtended = false;
            if(i>=totalNoOfSlots && isPremium){
                slotTosave.date = this.formatDate(tomorrow.getTime());
                slotTosave.slot = i-totalNoOfSlots;
                slotTosave.time = this.getTimeFromSlot(slotTosave.slot,vendor);
                slotTosave.isExtended = true;
            }
            slotsToSave.push(slotTosave);
        }

        if(slotsToSave.length === requiredSlots){
            //update delivery date and time for all the slots
            const lastslot = slotsToSave[slotsToSave.length - 1];
            const deliveryTime = this.getTimeFromSlot(lastslot.slot+1,vendor);
            slotsToSave = slotsToSave.map((d)=>{
                d.deliveryDate = lastslot.date;
                d.deliveryTime = deliveryTime;
                return d;
            });
        }else{
            //error invalid slot
            slotsToSave = [];
            
        }
        return slotsToSave





    }

    //utility Methods
    private formatDate(milliseconds:number):string{
        const givenDate = new Date(milliseconds)
        let dd:any = givenDate.getDate();
        let mm:any = givenDate.getMonth()+1; 
        const yyyy:any = givenDate.getFullYear();
        const hr:any = givenDate.getHours();
        const min:any = givenDate.getMinutes();
        if(dd<10) 
        {
            dd=`0${dd}`;
        } 
        if(mm<10) 
        {
            mm=`0${mm}`;
        } 
    
        const time = hr + (min / 60);
        console.log("time",time);
    
        //return {"date" : `${dd}-${mm}-${yyyy}`, "time":time};
        return `${dd}-${mm}-${yyyy}`;
    }
    private getTimeFromSlot(slotNumber:number,vendor:Vendor):string{
        const defaecoTime = vendor.workStartHours + (slotNumber*vendor.slotDuration);
        return this.parseDefaecTimeToTime(defaecoTime);
    }
    private parseDefaecTimeToTime(time:number) {
        let timeStr = '';
        if (time === 12.5) {
            timeStr = (time) + " PM";
        }
        else if (time > 12.5) {
            timeStr = (time - 12) + " PM";
        } else {
            timeStr = (time) + " AM";
        }
        return timeStr;
    }

}
export class Slot{
    slot:number = -1;
    bay:string = "";
    date:string = "";
    time:string = "";
    id:string="";
    deliveryDate:string ="";
    deliveryTime:string ="";
    isExtended:boolean = false;  
    isTomorrow:boolean = false; 
    isBooked:boolean = false;
    vendorId:string = "";
    orderId:String = "";

}