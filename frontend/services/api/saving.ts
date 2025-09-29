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
    fetch(url, {method: "PATCH", headers: headers, body: propertiesBody });

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
}

async function deleteImage(product: Product, image: {id: number}) {
    const url = new URL(baseUrl + `/products/${product.id}/images`);
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
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
    }
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
