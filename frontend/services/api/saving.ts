import {Product} from "@/types/Product";
import {getProduct} from "@/services/api/fetching";
import {getToken} from "@/services/api/authentication";

const baseUrl = "https://api.cml-relab.org"

function toNewProduct(product: Product): any {
    return ({
        name: product.name,
        brand: product.brand,
        model: product.model,
        description: product.description,
        bill_of_materials: [{
            "quantity": 42,
            "unit": "kg",
            "material_id": 1
        }],
        physical_properties: toUpdatePhysicalProperties(product),
        amount_in_parent: product.parentID ? 1 : undefined,
    })
}

function toUpdateProduct(product: Product): any {
    return ({
        name: product.name,
        brand: product.brand,
        model: product.model,
        description: product.description,
    })
}

function toUpdatePhysicalProperties(product: Product): any {
    return ({
        weight_kg: product.physicalProperties.find(p => p.propertyName === "Weight")?.value || 0,
        height_cm: product.physicalProperties.find(p => p.propertyName === "Height")?.value || 0,
        width_cm: product.physicalProperties.find(p => p.propertyName === "Width")?.value  || 0,
        depth_cm: product.physicalProperties.find(p => p.propertyName === "Depth")?.value || 0,
    })
}

export async function saveProduct(product: Product): Promise<number> {
    if (product.id === "new") {
        return await saveNewProduct(product);
    } else {
        return await updateProduct(product);
    }
}

async function saveNewProduct(product: Product): Promise<number> {
    const url = product.parentID ? new URL(`${baseUrl}/products/${product.parentID}/components`) : new URL(baseUrl + "/products");

    const token = await getToken();
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    }
    const body = JSON.stringify(toNewProduct(product));

    const response = await fetch(url, {method: "POST", headers: headers, body: body});
    const data = await response.json();

    console.log("Created product:", data);
    product.id = data.id;  // Update product ID to the newly assigned ID so we can add images

    await updateProductImages(product);

    return data.id;
}

async function updateProduct(product: Product): Promise<number> {
    const token = await getToken();
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    }

    const productBody = JSON.stringify(toUpdateProduct(product));
    const propertiesBody = JSON.stringify(toUpdatePhysicalProperties(product));

    let url = new URL(baseUrl + `/products/${product.id}`)
    const response = await fetch(url, {method: "PATCH", headers: headers, body: productBody });

    url = new URL(baseUrl + `/products/${product.id}/physical_properties`)
    await fetch(url, {method: "PATCH", headers: headers, body: propertiesBody });
    await updateProductImages(product);

    const data = await response.json();

    return data.id
}

async function updateProductImages(product: Product) {
    const currentImages = await getProduct(product.id);
    const imagesToDelete = currentImages.images.filter(img => !product.images.some(i => i.id === img.id));
    const imagesToAdd = product.images.filter(img => !img.id);

    for (const img of imagesToDelete) {
        await deleteImage(product, img);
    }

    for (const img of imagesToAdd) {
        await addImage(product, img);
    }
}

async function deleteImage(product: Product, image: {id: number}) {
    const url = new URL(baseUrl + `/products/${product.id}/images/${image.id}`);
    const token = await getToken();
    const headers = {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    }
    return await fetch(url, {method: "DELETE", headers: headers});
}

async function addImage(product: Product, image: {url: string, description: string}) {
    const url = new URL(baseUrl + `/products/${product.id}/images`);
    const token = await getToken();
    const headers = {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    }
    const body = new FormData();

    if (image.url.startsWith("data:")) {
        body.append("file", dataURItoBlob(image.url), "image.png");
    } else if (image.url.startsWith("file:")) {
        body.append("file", { uri: image.url, name: "image.png", type: "image/png" } as any);
    }

    await fetch(url, {method: "POST", headers: headers, body: body});
}

function dataURItoBlob(dataURI: string) {
    const byteString = atob(dataURI.split(",")[1]); // decode base64
    const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0]; // e.g. "image/png"

    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], { type: mimeString });
}

export async function deleteProduct(product: Product): Promise<void> {
    if (product.id === "new") {return} // New products are not saved yet
    const url = new URL(baseUrl + `/products/${product.id}`);
    const token = await getToken();
    const headers = {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    }
    await fetch(url, {method: "DELETE", headers: headers});
    return;
}

export function isProductValid(product: Product): boolean {
    return (
        product.name != undefined && product.name != "" &&
        product.brand != undefined && product.brand != "" &&
        product.model != undefined && product.model != "" &&
        product.description != undefined && product.description != "" &&
        product.physicalProperties.every(prop => !Number.isNaN(prop.value) && prop.value > 0)
    )
}
